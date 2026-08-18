/**
 * Utilidades puras para la importación de unidades por IA.
 *
 * Existen porque la ruta hacía UNA sola llamada con todo el archivo dentro:
 *  - la entrada se cortaba en 60.000 caracteres sin avisar (un Excel de 400
 *    unidades con 15 columnas pasa de 68.000), y
 *  - la salida no cabía en `max_tokens: 16384` (~50 tokens por unidad, así que
 *    el techo real son ~300 unidades). Al cortarse la respuesta a mitad de un
 *    objeto no quedaba ningún `]`, el JSON.parse reventaba y la ruta devolvía
 *    422 «La IA no pudo estructurar el archivo» con un archivo perfectamente
 *    válido: no se importaban 330 de 400 unidades, se importaban CERO.
 *
 * La solución es trocear por filas y llamar al modelo una vez por trozo, más
 * un rescate para el caso en que aun así la respuesta venga cortada.
 */

export interface ExtractChunk {
  /** Texto a enviar al modelo (encabezado + filas del trozo). */
  text: string;
  /** Filas de datos que lleva (sin contar el encabezado repetido). */
  rows: number;
}

/**
 * Parte el volcado del archivo en trozos de filas completas. El encabezado
 * (primera línea no vacía) se repite en cada trozo: sin él, el modelo pierde
 * el significado de las columnas y a partir del segundo trozo devuelve basura.
 *
 * Nunca parte una fila por la mitad, que era el otro efecto del `.slice()`.
 */
export function chunkRowsForExtraction(
  raw: string,
  opts: { maxLines?: number; maxChars?: number } = {}
): ExtractChunk[] {
  const maxLines = Math.max(1, opts.maxLines ?? 120);
  const maxChars = Math.max(500, opts.maxChars ?? 20_000);

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  if (lines.length === 1) return [{ text: lines[0], rows: 1 }];

  const header = lines[0];
  const body = lines.slice(1);
  const chunks: ExtractChunk[] = [];
  let current: string[] = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({ text: [header, ...current].join("\n"), rows: current.length });
    current = [];
    currentChars = 0;
  };

  for (const line of body) {
    // Una sola línea gigantesca (un PDF entero en un renglón) no se puede
    // trocear por filas; se manda sola y se corta al tope para no reventar.
    if (line.length > maxChars) {
      flush();
      chunks.push({ text: [header, line.slice(0, maxChars)].join("\n"), rows: 1 });
      continue;
    }
    if (current.length >= maxLines || currentChars + line.length > maxChars) flush();
    current.push(line);
    currentChars += line.length + 1;
  }
  flush();

  return chunks;
}

/**
 * Extrae el arreglo JSON de la respuesta del modelo. Si viene cortado (por
 * `max_tokens`), rescata los objetos completos en vez de perderlo todo.
 */
export function salvageJsonArray(raw: string): { rows: unknown[]; truncated: boolean } | null {
  const text = (raw || "").trim();
  const start = text.indexOf("[");
  if (start < 0) return null;

  // Camino normal: el arreglo está completo.
  const m = text.match(/\[[\s\S]*\]/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) return { rows: parsed, truncated: false };
    } catch {
      // Cae al rescate.
    }
  }

  // Rescate: cerrar el arreglo en el último objeto completo. Se prueban varias
  // llaves de cierre desde el final porque la última puede estar dentro de una
  // cadena partida (…"label":"Bloque C}) y no ser un cierre real.
  let end = text.lastIndexOf("}");
  for (let attempts = 0; end > start && attempts < 50; attempts++) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1) + "]");
      if (Array.isArray(parsed) && parsed.length > 0) return { rows: parsed, truncated: true };
    } catch {
      // Sigue hacia atrás.
    }
    end = text.lastIndexOf("}", end - 1);
  }

  return null;
}

/**
 * Une los resultados de varios trozos descartando repeticiones por `label`.
 * Los encabezados repetidos y las filas de continuación hacen que un mismo
 * apartamento aparezca en dos trozos; sin esto se crearían duplicados.
 */
export function dedupeByLabel<T extends { label: string }>(units: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const u of units) {
    const key = u.label.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}
