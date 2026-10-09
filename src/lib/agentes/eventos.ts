/**
 * La bitácora de eventos de cada copropiedad: cada módulo anota aquí lo que se hace (un pago, una PQRS respondida, un acta generada)
 * y los agentes lo leen sin que nadie se lo cuente en el chat. Es parte de su memoria operativa.
 *
 * `registrarEvento` NUNCA lanza (anotar no puede romper lo que se estaba haciendo) y no hace nada en el demo. El resumen es una línea
 * en español; no se guardan datos personales que el hecho no necesite (se dice «Apto 502», no el nombre del residente).
 */
export const MODULOS_DE_EVENTO = [
  "cartera",
  "presupuesto",
  "pqrs",
  "comunicados",
  "asambleas",
  "certificados",
  "reuniones",
  "documentos",
  "bitacora",
  "generacion",
  "residentes",
  "agentes",
] as const;
export type ModuloDeEvento = (typeof MODULOS_DE_EVENTO)[number];

export type EventoNuevo = {
  userId: string;
  propertyId: string;
  modulo: ModuloDeEvento;
  accion: string;
  resumen: string;
  refType?: string | null;
  refId?: string | null;
  /** «usuario» (por defecto), «sistema», «residente» o «agente:<id>». */
  actor?: string;
};

export const TOPE_DEL_RESUMEN = 220;

/** Una línea, sin saltos ni espacios de más, con tope. */
export function limpiarResumen(texto: string): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length <= TOPE_DEL_RESUMEN ? t : `${t.slice(0, TOPE_DEL_RESUMEN - 1)}…`;
}

export function filaDeEvento(e: EventoNuevo) {
  return {
    userId: e.userId,
    propertyId: e.propertyId,
    module: e.modulo,
    action: e.accion.slice(0, 60),
    summary: limpiarResumen(e.resumen),
    refType: e.refType ?? null,
    refId: e.refId ?? null,
    actor: (e.actor ?? "usuario").slice(0, 40),
  };
}

export async function registrarEvento(e: EventoNuevo): Promise<void> {
  if (process.env.DEMO_MODE === "true" || !e.userId || !e.propertyId) return;
  try {
    const { db } = await import("@/lib/db");
    const { ensureOperacionSchema } = await import("@/lib/ensure-operacion-schema");
    await ensureOperacionSchema();
    await db.propertyEvent.create({ data: filaDeEvento(e) });
  } catch (error) {
    console.error("[agentes/eventos] no se pudo anotar el evento:", error instanceof Error ? error.message : error);
  }
}
