/**
 * Selección de documento a generar.
 *
 * El informe de gestión y el acta son documentos **completamente distintos**:
 * distinto propósito, distinto insumo (estados financieros vs. grabación de la
 * reunión) y distinto agente (Strategos vs. Grammateus). Generarlos a la vez
 * mezclaba los insumos de ambos en un mismo contexto y ensuciaba los dos
 * resultados. Por eso la selección es EXCLUYENTE: uno u otro, nunca los dos.
 *
 * La presentación no es un tercer documento: son las diapositivas del informe,
 * así que solo tiene sentido acompañando al informe.
 */
export type DocKind = "informe" | "acta";

export interface DocSelection {
  kind: DocKind;
  /** Solo puede ser true cuando kind === "informe". */
  includePptx: boolean;
}

/** Los tres booleanos que consume el motor de generación. */
export interface DocFlags {
  includeInforme: boolean;
  includeActa: boolean;
  includePptx: boolean;
}

export const DOC_KIND_LABELS: Record<DocKind, string> = {
  informe: "Informe de gestión",
  acta: "Acta de reunión",
};

/**
 * Normaliza cualquier forma de entrada a una selección válida.
 *
 * Acepta `docKind` (canónico) y los booleanos antiguos, para que las peticiones
 * en vuelo y los lotes ya encolados sigan funcionando tras el despliegue.
 * Cuando la entrada antigua pide informe y acta a la vez, gana el informe: era
 * el predeterminado histórico y es el documento mensual habitual.
 */
export function normalizeDocSelection(input: {
  docKind?: unknown;
  includeInforme?: unknown;
  includeActa?: unknown;
  includePptx?: unknown;
}): DocSelection {
  const kind: DocKind =
    input.docKind === "acta"
      ? "acta"
      : input.docKind === "informe"
        ? "informe"
        : // Sin docKind, se deduce de los booleanos antiguos.
          input.includeActa === true && input.includeInforme !== true
          ? "acta"
          : "informe";

  return {
    kind,
    // La presentación se descarta con el acta: no existen diapositivas de un acta.
    includePptx: kind === "informe" && input.includePptx === true,
  };
}

/** Convierte la selección a los booleanos que espera `runGeneration`. */
export function toDocFlags(sel: DocSelection): DocFlags {
  return {
    includeInforme: sel.kind === "informe",
    includeActa: sel.kind === "acta",
    includePptx: sel.includePptx,
  };
}

/**
 * Normaliza la lista `docTypes` de un lote de empresa a una selección válida.
 * Devuelve null si la lista no pide ningún documento.
 */
export function docSelectionFromTypes(types: unknown): DocSelection | null {
  const list = Array.isArray(types) ? types.map(String) : [];
  const wantsInforme = list.includes("informe");
  const wantsActa = list.includes("acta");
  if (!wantsInforme && !wantsActa) return null;
  return normalizeDocSelection({
    docKind: wantsInforme ? "informe" : "acta",
    includePptx: list.includes("pptx"),
  });
}

/** La selección, de vuelta a `docTypes` para persistirla en el lote. */
export function docTypesFromSelection(sel: DocSelection): string[] {
  return sel.includePptx ? [sel.kind, "pptx"] : [sel.kind];
}
