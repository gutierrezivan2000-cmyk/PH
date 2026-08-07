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
 * Next occurrence after marking an asset "done". Recurring assets (e.g. an
 * elevator serviced every 3 months, a policy renewed every 12) roll forward
 * instead of just being checked off — a maintenance tracker whose reminders
 * never come back after the first time isn't tracking anything.
 */
export function advanceDueDate(current: Date, recurrenceMonths: number): Date {
  const next = new Date(current);
  next.setMonth(next.getMonth() + recurrenceMonths);
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
