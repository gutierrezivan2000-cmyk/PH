export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { verificarDescarga } from "@/lib/agent-file-token";

/**
 * Entrega un archivo generado por un agente.
 *
 * El archivo está en Blob privado; el permiso viaja firmado en el enlace y se
 * comprueba contra la sesión, así que un enlace copiado a otra cuenta no sirve.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const token = req.nextUrl.searchParams.get("t") || "";
  const permiso = verificarDescarga(token, session.user.id);
  if (!permiso) {
    return NextResponse.json(
      { error: "El enlace de descarga no es válido o caducó. Pídele el archivo otra vez al agente." },
      { status: 403 }
    );
  }

  const { isAllowedBlobUrl } = await import("@/lib/blob-url");
  if (!isAllowedBlobUrl(permiso.url)) {
    return NextResponse.json({ error: "Archivo no disponible" }, { status: 404 });
  }

  try {
    const { get } = await import("@vercel/blob");
    const result = await get(permiso.url, { access: "private" }).catch(() => null);
    const cuerpo = result
      ? result.stream
      : await fetch(permiso.url).then((r) => (r.ok ? r.body : null)).catch(() => null);
    if (!cuerpo) {
      return NextResponse.json({ error: "El archivo ya no está disponible" }, { status: 404 });
    }

    const nombre = permiso.nombre.replace(/[^\w.\- ]+/g, "_").slice(0, 80);
    return new NextResponse(cuerpo as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": permiso.mime,
        "Content-Disposition": `attachment; filename="${nombre}"`,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (e) {
    console.error("[agents/files]", e);
    return NextResponse.json({ error: "No se pudo descargar el archivo" }, { status: 500 });
  }
}
