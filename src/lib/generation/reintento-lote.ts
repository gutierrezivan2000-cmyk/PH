/**
 * Qué le decimos a la persona cuando pulsa «Reintentar fallidas» en un lote (POST /api/empresa/batch/[id]).
 *
 * Pura (sin base de datos ni React) para probarla sola y poder usarla en el navegador. La ruta responde:
 *  - 200 { requeued, skippedCap, skippedAntiguas }: se reencoló lo que cupo; el resto se explica en un aviso.
 *  - 429 { error, ... }: el tope mensual está agotado, no se reencoló nada.
 *  - 400 { error, ... }: todas las fallidas son de un mes anterior, no se reencoló nada.
 * Antes la pantalla ignoraba la respuesta: un 429 o un 400 parecían un reintento que "no hacía nada".
 */
export type AvisoDeReintento = {
  tipo: "error" | "aviso";
  titulo: string;
  texto?: string;
};

/** Texto de respaldo por código, para cuando la respuesta no trae un `error` legible (corte del proxy, HTML, JSON roto). */
const TEXTO_POR_ESTADO: Record<number, string> = {
  400: "Esas fallidas son de un mes anterior y no se reintentan. Crea un lote nuevo con las mismas propiedades.",
  401: "Tu sesión venció. Vuelve a iniciar sesión para reintentar.",
  403: "No tienes permiso para reintentar este lote.",
  404: "No encontramos este lote.",
  429: "Llegaste al tope de generaciones de este mes. Las fallidas se podrán reintentar cuando se renueve el cupo.",
};
const TEXTO_GENERICO = "No se pudieron reintentar las fallidas. Inténtalo de nuevo en un momento.";

/** Un contador de la respuesta como entero >= 0 (lo que no sea número cuenta como cero). */
function contador(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : 0;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/**
 * Aviso para la respuesta del reintento, o null cuando todo se reencoló y no hay nada que explicar (el avance del lote ya lo muestra).
 * `ok` y `estado` son los de la respuesta HTTP; `datos` es su JSON (o null si no se pudo leer).
 */
export function avisoDeReintento(ok: boolean, estado: number, datos: unknown): AvisoDeReintento | null {
  const d = datos && typeof datos === "object" && !Array.isArray(datos) ? (datos as Record<string, unknown>) : {};

  if (!ok) {
    const delServidor = typeof d.error === "string" ? d.error.trim() : "";
    return { tipo: "error", titulo: delServidor || TEXTO_POR_ESTADO[estado] || TEXTO_GENERICO };
  }

  const reencoladas = contador(d.requeued);
  const porTope = contador(d.skippedCap);
  const antiguas = contador(d.skippedAntiguas);

  const partes: string[] = [];
  if (porTope > 0) {
    partes.push(
      `${porTope} ${plural(porTope, "sigue fallida", "siguen fallidas")} porque llegaste al tope mensual: ` +
        `${plural(porTope, "podrás reintentarla", "podrás reintentarlas")} cuando se renueve el cupo.`,
    );
  }
  if (antiguas > 0) {
    partes.push(
      `${antiguas} ${plural(antiguas, "es", "son")} de un mes anterior y no se ${plural(antiguas, "reintenta", "reintentan")}: ` +
        `crea un lote nuevo con ${plural(antiguas, "esa propiedad", "esas propiedades")}.`,
    );
  }

  if (partes.length === 0) {
    // Todo salió bien: no hace falta aviso. Si no se reencoló nada y tampoco se saltó nada, no había fallidas que reintentar.
    return reencoladas > 0 ? null : { tipo: "aviso", titulo: "No había fallidas para reintentar." };
  }

  return {
    tipo: "aviso",
    titulo: reencoladas > 0 ? `Reencolamos ${reencoladas} ${plural(reencoladas, "fallida", "fallidas")}.` : "No se reencoló ninguna fallida.",
    texto: partes.join(" "),
  };
}
