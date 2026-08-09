// Bitácora de zonas comunes y pólizas — lógica pura, sin acceso a datos.

export type AssetKind = "zona_comun" | "poliza";

export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  zona_comun: "Zona común",
  poliza: "Póliza",
};

export interface CommonAssetLike {
  id: string;
  propertyId: string;
  kind: string;
  name: string;
  provider: string | null;
  reference: string | null;
  notes: string | null;
  dueDate: Date;
  recurrenceMonths: number | null;
  status: string;
}

export function normalizeAssetKind(v: unknown): AssetKind {
  return v === "poliza" ? "poliza" : "zona_comun";
}

/**
 * Suma meses SIN el desbordamiento de `Date.setMonth`.
 *
 * `new Date("2026-01-31").setMonth(+1)` da 3 de marzo, no 28 de febrero:
 * febrero no tiene 31 días y JS desborda al mes siguiente. Un mantenimiento
 * mensual fijado el 31 de enero saltaba febrero entero y luego iba derivando
 * (31 ago + 1 mes = 1 de octubre, saltándose septiembre).
 *
 * Se ancla en el día de la fecha recibida y lo recorta al último día del mes
 * destino, que es lo que significa "mensual el día 31".
 *
 * Compromiso conocido: el modelo solo guarda `dueDate`, no el día original,
 * así que tras pasar por un mes corto el ancla baja con él (31 ene -> 28 feb
 * -> 28 mar, no 31 mar). La deriva es de una sola vez y se estabiliza en 28,
 * que existe en todos los meses. Eliminarla del todo exigiría una columna
 * nueva; no compensa por unos días dentro del mes correcto, que es lo que
 * de verdad importa en una bitácora de mantenimiento.
 */
function addMonthsClamped(base: Date, months: number, anchorDay: number): Date {
  const d = new Date(base);
  d.setDate(1); // evita el desbordamiento antes de cambiar de mes
  d.setMonth(d.getMonth() + months);
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(anchorDay, lastDayOfMonth));
  return d;
}

/**
 * Próxima ocurrencia al marcar un activo como "hecho". Los activos recurrentes
 * (un ascensor con revisión trimestral, una póliza anual) avanzan al siguiente
 * ciclo en vez de solo tacharse — un rastreador de mantenimiento cuyos avisos
 * no vuelven no rastrea nada.
 *
 * Avanza hasta rebasar `now`: un activo que se dejó de registrar hace ocho
 * meses saltaba un solo ciclo y seguía apareciendo como vencido, obligando a
 * pulsar "hecho" ocho veces seguidas para ponerlo al día.
 */
export function advanceDueDate(
  current: Date,
  recurrenceMonths: number,
  now: Date = new Date()
): Date {
  const anchorDay = current.getDate();
  let next = addMonthsClamped(current, recurrenceMonths, anchorDay);
  // El tope de ciclos es defensivo: recurrenceMonths ya se valida en 1..60,
  // pero un valor corrupto en base no debe colgar el proceso.
  for (let i = 0; next <= now && i < 600; i++) {
    next = addMonthsClamped(next, recurrenceMonths, anchorDay);
  }
  return next;
}

/** The calendar row category — reuses the existing "poliza"/"mantenimiento" chips. */
export function categoryForKind(kind: string): "poliza" | "mantenimiento" {
  return kind === "poliza" ? "poliza" : "mantenimiento";
}

export function defaultTitle(a: Pick<CommonAssetLike, "kind" | "name">): string {
  return a.kind === "poliza" ? `Vencimiento: ${a.name}` : `Mantenimiento: ${a.name}`;
}

export function recurrenceLabel(months: number): string {
  return months === 1 ? "cada mes" : `cada ${months} meses`;
}

export function assetDescription(
  a: Pick<CommonAssetLike, "provider" | "reference" | "recurrenceMonths">
): string {
  const parts: string[] = [];
  if (a.provider) parts.push(a.provider);
  if (a.reference) parts.push(`Ref. ${a.reference}`);
  if (a.recurrenceMonths) parts.push(recurrenceLabel(a.recurrenceMonths));
  return parts.join(" · ");
}
