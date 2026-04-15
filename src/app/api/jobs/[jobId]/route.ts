import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGenerationById, DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

/** Convert raw blob URLs stored in DB to proxy download URLs */
function toProxyUrls(generationId: string, outputFiles: Record<string, string> | null | undefined): Record<string, string> | null {
  if (!outputFiles) return null;
  const proxy: Record<string, string> = {};
  if (outputFiles.informeHtml) proxy.informeHtml = `/api/download/${generationId}/informe`;
  if (outputFiles.actaHtml) proxy.actaHtml = `/api/download/${generationId}/acta`;
  if (outputFiles.presentacionPptx) proxy.presentacionPptx = `/api/download/${generationId}/pptx`;
  return Object.keys(proxy).length > 0 ? proxy : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { jobId } = await params;

  if (IS_DEMO) {
    const generation = getGenerationById(jobId, DEMO_USER.id);
    if (!generation) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(generation);
  }

  try {
    const { db } = await import("@/lib/db");
    const generation = await db.generation.findFirst({
      where: { id: jobId, userId: session.user.id },
      include: { property: true },
    });

    if (!generation) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Replace raw blob URLs with proxy download URLs
    return NextResponse.json({
      ...generation,
      progress: generation.progress ?? 0,
      outputFiles: toProxyUrls(generation.id, generation.outputFiles as Record<string, string> | null),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error de base de datos: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
