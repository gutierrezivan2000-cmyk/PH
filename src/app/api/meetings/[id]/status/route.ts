export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible } from "@/lib/meetings/acceso";
import { hayTrabajoSinAtender } from "@/lib/meetings/cola";
import { demoEstado } from "@/lib/meetings/demo";
import { empujar } from "@/lib/meetings/empujon";
import { contarTareasDeEtapa, esEtapa } from "@/lib/meetings/orquestador";
import { estaEnMarcha } from "@/lib/meetings/tipos";

type Contexto = { params: Promise<{ id: string }> };

/**
 * GET /api/meetings/[id]/status → { status, stage, progress, errorMessage, durationMs, coverage, tareas: { hechas, total } }
 *
 * Lo consulta la página mientras la reunión se procesa. Además empuja el trabajo: si hay tareas listas y nadie las
 * está haciendo (o quien las hacía lleva más de 45 s sin avisar), arranca un trabajador con `after()`. Así las vistas
 * previas —que no tienen cron— avanzan mientras alguien mira la página; en producción el cron sigue aunque la cierre.
 */
export async function GET(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const r = demoEstado(ctx.userId, id);
    return r ? NextResponse.json(r) : NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await db.meeting.findFirst({
      where: { id, userId: ctx.userId },
      select: { status: true, stage: true, progress: true, errorMessage: true, durationMs: true, coverage: true },
    });
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

    let tareas: { hechas: number | null; total: number | null } = { hechas: null, total: null };
    if (estaEnMarcha(reunion.status)) {
      const filas = await db.meetingTask.findMany({ where: { meetingId: id }, select: { kind: true, key: true, status: true } });
      tareas = esEtapa(reunion.stage) ? contarTareasDeEtapa(filas, reunion.stage) : { hechas: 0, total: 0 };
      if (await hayTrabajoSinAtender(id)) empujar();
    }
    return NextResponse.json({ ...reunion, tareas });
  } catch (error) {
    console.error("[api/meetings/[id]/status]", error);
    return NextResponse.json({ error: "No pudimos consultar el estado de la reunión." }, { status: 500 });
  }
}
