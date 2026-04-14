export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGenerationById, DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

const FILE_TYPE_MAP: Record<string, { key: string; contentType: string; filename: string }> = {
  informe: {
    key: "informeHtml",
    contentType: "text/html; charset=utf-8",
    filename: "informe.html",
  },
  acta: {
    key: "actaHtml",
    contentType: "text/html; charset=utf-8",
    filename: "acta.html",
  },
  pptx: {
    key: "presentacionPptx",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    filename: "presentacion.pptx",
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

  // Fetch the private blob content from Vercel Blob storage
  try {
    const blobResponse = await fetch(blobUrl, {
      headers: {
        Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    });

    if (!blobResponse.ok) {
      return NextResponse.json(
        { error: `Error al obtener archivo: ${blobResponse.status}` },
        { status: 502 }
      );
    }

    const body = blobResponse.body;
    if (!body) {
      return NextResponse.json({ error: "Archivo vacio" }, { status: 502 });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": fileInfo.contentType,
        "Content-Disposition": fileType === "pptx"
          ? `attachment; filename="${fileInfo.filename}"`
          : "inline",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error al descargar: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
