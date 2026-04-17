export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGenerationById, DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

const FILE_TYPE_MAP: Record<string, { key: string; contentType: string; filename: string }> = {
  informe: {
    key: "informeHtml",
    contentType: "text/html; charset=utf-8",
    filename: "informe-de-gestion.html",
  },
  acta: {
    key: "actaHtml",
    contentType: "text/html; charset=utf-8",
    filename: "acta-de-reunion.html",
  },
  pptx: {
    key: "presentacionPptx",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    filename: "presentacion.pptx",
  },
  transcripcion: {
    key: "transcripcion",
    contentType: "text/plain; charset=utf-8",
    filename: "transcripcion-insumos.txt",
  },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ generationId: string; fileType: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { generationId, fileType } = await params;

  const fileInfo = FILE_TYPE_MAP[fileType];
  if (!fileInfo) {
    return NextResponse.json({ error: "Tipo de archivo no valido" }, { status: 400 });
  }

  let blobUrl: string | undefined;

  if (IS_DEMO) {
    const generation = getGenerationById(generationId, DEMO_USER.id);
    if (!generation) {
      return NextResponse.json({ error: "Generacion no encontrada" }, { status: 404 });
    }
    const outputFiles = generation.outputFiles as Record<string, string> | null;
    blobUrl = outputFiles?.[fileInfo.key];
  } else {
    try {
      const { db } = await import("@/lib/db");
      const generation = await db.generation.findFirst({
        where: { id: generationId, userId: session.user.id },
      });
      if (!generation) {
        return NextResponse.json({ error: "Generacion no encontrada" }, { status: 404 });
      }
      const outputFiles = generation.outputFiles as Record<string, string> | null;
      blobUrl = outputFiles?.[fileInfo.key];
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Error DB: ${msg.slice(0, 200)}` }, { status: 500 });
    }
  }

  if (!blobUrl) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  // For demo mode, the blobUrl might be an internal demo route — redirect
  if (IS_DEMO && blobUrl.startsWith("/api/demo/")) {
    return NextResponse.redirect(new URL(blobUrl, _req.url));
  }

  // Fetch the blob content — try @vercel/blob get() first, fall back to direct fetch
  try {
    const { get } = await import("@vercel/blob");
    const result = await get(blobUrl, { access: "private" }).catch(() => null);

    if (!result) {
      // Fallback: direct fetch for public blobs
      console.log(`[download] get() returned null, trying direct fetch: ${blobUrl}`);
      const directRes = await fetch(blobUrl);
      if (!directRes.ok) {
        return NextResponse.json({ error: "Archivo no encontrado en storage" }, { status: 404 });
      }
      return new NextResponse(directRes.body, {
        status: 200,
        headers: {
          "Content-Type": fileInfo.contentType,
          "Content-Disposition": fileType === "pptx"
            ? `attachment; filename="${fileInfo.filename}"`
            : `inline; filename="${fileInfo.filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        "Content-Type": fileInfo.contentType,
        "Content-Disposition": fileType === "pptx"
          ? `attachment; filename="${fileInfo.filename}"`
          : `inline; filename="${fileInfo.filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[download] Blob get() error, trying direct fetch: ${msg}`, { blobUrl });

    // Fallback: direct fetch (works for public blobs)
    try {
      const directRes = await fetch(blobUrl);
      if (!directRes.ok) {
        return NextResponse.json({ error: "Archivo no encontrado en storage" }, { status: 404 });
      }
      return new NextResponse(directRes.body, {
        status: 200,
        headers: {
          "Content-Type": fileInfo.contentType,
          "Content-Disposition": fileType === "pptx"
            ? `attachment; filename="${fileInfo.filename}"`
            : `inline; filename="${fileInfo.filename}"`,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      console.error(`[download] Direct fetch also failed: ${msg2}`);
      return NextResponse.json({ error: `Error al descargar archivo: ${msg2.slice(0, 200)}` }, { status: 500 });
    }
  }
}
