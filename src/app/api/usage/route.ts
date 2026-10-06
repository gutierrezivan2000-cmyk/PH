import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { getUsageSummary, getGenerationFileLimits } from "@/lib/usage";
import { getUsageSummary as getDemoUsage, DEMO_USER } from "@/lib/demo-store";
import { sesionVeReuniones } from "@/lib/meetings/acceso";
import { resumenDeHoras } from "@/lib/meetings/cupos";
import { demoHorasDeReuniones } from "@/lib/meetings/demo";
import type { HorasDeReunionesDTO } from "@/lib/meetings/dto";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // `fileLimits` viaja aquí para que la pantalla de generación pueda avisar
  // ANTES de subir: antes se subían los archivos a Blob y solo después
  // /api/generate/full rechazaba por plan, dejando los blobs huérfanos y
  // facturados, y la UI prometía topes que el servidor no acepta.
  if (IS_DEMO) {
    return NextResponse.json({
      ...getDemoUsage(DEMO_USER.id),
      fileLimits: { maxFiles: 20, maxFileSizeMb: 50 },
      reuniones: demoHorasDeReuniones(),
    });
  }

  const [usage, fileLimits, reuniones] = await Promise.all([
    getUsageSummary(session.user.id),
    getGenerationFileLimits(session.user.id),
    horasDeReuniones(session.user.id),
  ]);
  return NextResponse.json({ ...usage, fileLimits, ...(reuniones ? { reuniones } : {}) });
}

/**
 * Las horas de reuniones del plan, solo para quien ve Reuniones (mientras sea solo para administradores, nadie más las recibe).
 * Es información de apoyo: si no se puede calcular, la respuesta sale sin ella en vez de fallar.
 */
async function horasDeReuniones(userId: string): Promise<HorasDeReunionesDTO | null> {
  try {
    if (!(await sesionVeReuniones())) return null;
    await ensureMeetingsSchema();
    return await resumenDeHoras(userId);
  } catch (error) {
    console.error("[api/usage] no se pudieron contar las horas de reuniones", error);
    return null;
  }
}
