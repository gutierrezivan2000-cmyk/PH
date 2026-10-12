export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { MAX_BYTES_INFORME, extraerViolaciones, lineaDeInforme } from "@/lib/csp";

/**
 * Destino de los informes de violación de la Content-Security-Policy (directiva `report-uri`, ver src/lib/csp.ts). Entiende también
 * el formato de `report-to`, por si algún día se añade esa directiva.
 *
 * Lo llama el NAVEGADOR de cualquiera, sin sesión, así que todo lo que llega es hostil. Reglas:
 *  - Responde SIEMPRE 204, haga lo que haga el informe: ni un error ni un 429 deben llegar al navegador (reintentaría o ensuciaría
 *    la consola) y nada de esto puede romper una página.
 *  - Solo se leen los dos tipos de contenido de los informes (application/csp-report y application/reports+json) y como mucho 8 KB.
 *  - Límite por IP con el limitador de la aplicación: pasado el tope se descarta en silencio.
 *  - Un único renglón de log por petición, con la directiva y el HOST bloqueado; nunca la URL completa (en ella viajan tokens).
 */

const TIPOS_ACEPTADOS = new Set(["application/csp-report", "application/reports+json"]);

// Generoso para un navegador normal (un cargue de página con un problema envía unos pocos informes) y corto para quien inunde.
const LIMITE = { max: 60, windowMs: 60 * 1000 };

const SIN_CONTENIDO = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });

/** ¿Declara el cliente (Content-Length) un cuerpo mayor que el tope? Se mira antes de tocar la base. */
function declaraDemasiado(req: NextRequest, maxBytes: number): boolean {
  const declarado = Number(req.headers.get("content-length"));
  return Number.isFinite(declarado) && declarado > maxBytes;
}

/**
 * Lee el cuerpo sin pasar de `maxBytes`, cortando la lectura al pasarse (Content-Length puede faltar o mentir). Devuelve null si
 * se pasa.
 */
async function leerCuerpoAcotado(req: NextRequest, maxBytes: number): Promise<string | null> {
  if (!req.body) return "";

  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await lector.cancel().catch(() => {});
      return null;
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString("utf8");
}

export async function POST(req: NextRequest) {
  try {
    // 1) Lo barato primero, antes de tocar la base: tipo de contenido y tamaño declarado.
    const tipo = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TIPOS_ACEPTADOS.has(tipo) || declaraDemasiado(req, MAX_BYTES_INFORME)) return SIN_CONTENIDO();

    // 2) Freno por IP. El limitador va a la base, que en demo no existe: ahí no hay nada que contar (y sin esta salida cada
    //    informe dejaría un error en el log). failClosed: si la base falla, se descarta; un informe perdido no cuesta nada.
    if (process.env.DEMO_MODE !== "true") {
      const { rateLimit, clientIp } = await import("@/lib/rate-limit");
      const rl = await rateLimit(`csp:ip:${clientIp(req)}`, { ...LIMITE, failClosed: true });
      if (!rl.allowed) return SIN_CONTENIDO();
    }

    // 3) Cuerpo acotado → violaciones reconocibles → una línea de log.
    const cuerpo = await leerCuerpoAcotado(req, MAX_BYTES_INFORME);
    if (cuerpo === null) return SIN_CONTENIDO();
    const linea = lineaDeInforme(extraerViolaciones(cuerpo));
    if (linea) console.warn(linea);
  } catch {
    // Un informe que no se pudo procesar no merece una respuesta distinta ni un error en el log.
  }
  return SIN_CONTENIDO();
}
