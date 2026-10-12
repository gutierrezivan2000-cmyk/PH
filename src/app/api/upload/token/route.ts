export const runtime = "nodejs";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { blobPerteneceA, PREFIJO_SUBIDAS } from "@/lib/blob-owner";
import { ALLOWED_CONTENT_TYPES, limiteBytesPara, limiteMbPara } from "@/lib/upload-limits";

// La lista de tipos y los topes viven en @/lib/upload-limits, compartidos con
// la pantalla de generación: cuando estaban duplicados, la pantalla dejaba
// soltar audios de móvil que este lado rechazaba.

/** Error con el estado HTTP que le corresponde (por omisión, cualquier otro fallo responde 400). */
class ErrorDeSubida extends Error {
  constructor(mensaje: string, readonly status: number) {
    super(mensaje);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (!session?.user?.id) {
          throw new ErrorDeSubida("No autorizado", 401);
        }
        // El archivo queda atado a quien lo sube: solo se emite token para
        // `subidas/<tu id>/…`. Es lo que después permite a cada ruta del
        // servidor comprobar, sin consultar nada, que un blob que le llega
        // desde el navegador es de quien lo manda (ver lib/blob-owner). Sin
        // esto, quien conociera la URL de un archivo ajeno podía dárselo a la
        // IA, adjuntarlo a su copropiedad o borrarlo.
        if (!blobPerteneceA(pathname, session.user.id)) {
          throw new ErrorDeSubida(
            `Ruta de subida no permitida: los archivos se suben a tu propia carpeta (${PREFIJO_SUBIDAS}/<tu id>/…). Recarga la página e inténtalo de nuevo.`,
            403
          );
        }
        // Tope POR TIPO: una grabación de asamblea necesita mucho más que un
        // PDF, y un único número para todo dejaba fuera el insumo del acta.
        const maximumSizeInBytes = limiteBytesPara(pathname);
        console.log(`[upload/token] ${pathname} — tope ${limiteMbPara(pathname)} MB`);
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes,
          // Seis horas en vez de la hora por defecto: una grabación de 200 MB
          // por una conexión lenta puede tardar más de una hora, y el token
          // caducaba justo al final, después de haber subido todo.
          validUntil: Date.now() + 6 * 60 * 60 * 1000,
          tokenPayload: JSON.stringify({ userId: session.user.id, pathname }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log("[upload/token] Upload completed:", blob.url, tokenPayload);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("[upload/token] Error:", msg);
    return NextResponse.json({ error: msg }, { status: error instanceof ErrorDeSubida ? error.status : 400 });
  }
}
