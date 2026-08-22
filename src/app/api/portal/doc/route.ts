export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

/**
 * Sirve al residente un documento de su copropiedad (reglamento, manual…).
 *
 * Existe porque el portal enlazaba directamente `PropertyDocument.url`, que
 * apunta a Vercel Blob con `access: "private"`: al pulsar «Abrir», el residente
 * no descargaba nada. La sección entera de Documentos estaba muerta.
 *
 * El enlace del portal (`portalToken`) es la credencial: se resuelve la unidad
 * por ese token y solo se entregan documentos de SU copropiedad, así que un id
 * de documento ajeno no sirve de nada.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") || "";
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!token || !id) {
    return NextResponse.json({ error: "Enlace incompleto" }, { status: 400 });
  }

  // En demo `db` es un Proxy que lanza. Además allí los documentos ya se
  // sirven por /api/demo/files, así que aquí no hay nada que hacer.
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json({ error: "No disponible en el demo" }, { status: 404 });
  }

  if (!/^[A-Za-z0-9_-]{16,48}$/.test(token)) {
    return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  }

  try {
    const { db } = await import("@/lib/db");
    const unit = await db.unit.findFirst({
      where: { portalToken: token },
      select: { propertyId: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
    }

    // El documento DEBE ser de la copropiedad de esa unidad.
    const doc = await db.propertyDocument.findFirst({
      where: { id, propertyId: unit.propertyId },
      select: { name: true, url: true, mimeType: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }

    const { isAllowedBlobUrl } = await import("@/lib/blob-url");
    if (!isAllowedBlobUrl(doc.url)) {
      return NextResponse.json({ error: "Documento no disponible" }, { status: 404 });
    }

    const { get } = await import("@vercel/blob");
    const result = await get(doc.url, { access: "private" }).catch(() => null);
    const cuerpo = result
      ? result.stream
      : await fetch(doc.url).then((r) => (r.ok ? r.body : null)).catch(() => null);
    if (!cuerpo) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }

    // `inline` para que el residente lo vea en el navegador; el nombre se
    // sanea porque va en una cabecera.
    const nombre = (doc.name || "documento").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    return new NextResponse(cuerpo as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${nombre}"`,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (e) {
    console.error("[portal/doc]", e);
    return NextResponse.json({ error: "No se pudo abrir el documento" }, { status: 500 });
  }
}
