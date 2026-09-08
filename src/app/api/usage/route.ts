import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUsageSummary, getGenerationFileLimits } from "@/lib/usage";
import { getUsageSummary as getDemoUsage, DEMO_USER } from "@/lib/demo-store";

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
      fileLimits: { maxFiles: 20, maxFileSizeMb: 25 },
    });
  }

  const [usage, fileLimits] = await Promise.all([
    getUsageSummary(session.user.id),
    getGenerationFileLimits(session.user.id),
  ]);
  return NextResponse.json({ ...usage, fileLimits });
}
