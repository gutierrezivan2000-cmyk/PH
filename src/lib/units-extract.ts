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

// El texto no llega crudo: los parsers anteponen un rótulo con el nombre del
// archivo y, en los Excel, un separador por hoja. La fila de columnas real es
// la TERCERA línea, no la primera.
//   [Datos de hoja de cálculo: padron.xlsx]
//   --- Hoja: Hoja1 ---
//   Apto,Propietario,Correo,Celular,Coef,Cuota
const BANNER_RE = /^\[[^\]]*\]$/;
const SHEET_RE = /^---\s*Hoja:.*---$/;

const DELIMITERS = [",", ";", "\t", "|"];

/**
 * ¿Esta línea parece una fila de tabla? Devuelve el separador dominante y
 * cuántas veces aparece. Sirve para no repetir como «encabezado» la primera
 * línea de un PDF de texto corrido, donde no hay columnas que explicar.
 */
function tabularShape(line: string): { delim: string; count: number } | null {
  let best: { delim: string; count: number } | null = null;
  for (const d of DELIMITERS) {
    const count = line.split(d).length - 1;
    // >= 1 separador = al menos dos columnas: un padrón mínimo es
    // «Apto,Propietario» y también merece que se repita su encabezado.
    if (count >= 1 && (!best || count > best.count)) best = { delim: d, count };
  }
  return best;
}

/**
 * Parte el volcado del archivo en trozos de filas completas. La fila de
 * columnas se repite en cada trozo: sin ella, del segundo trozo en adelante el
 * modelo recibe números desnudos (`205,Juan,,3001234567,1.25,350000`) y tiene
 * que adivinar cuál es el coeficiente y cuál la cuota.
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

  // Rótulos de cabecera del parser: se conservan solo en el primer trozo.
  const prelude: string[] = [];
  let i = 0;
  while (i < lines.length && (BANNER_RE.test(lines[i].trim()) || SHEET_RE.test(lines[i].trim()))) {
    prelude.push(lines[i]);
    i++;
  }
  if (i >= lines.length) return [];

  /**
   * La fila de columnas es la primera línea tabular, y solo se toma como
   * encabezado si la siguiente línea tiene una forma parecida. En un texto
   * corrido no hay encabezado que repetir y todas las líneas son datos.
   */
  const pickHeaderAt = (arr: string[], idx: number): string | null => {
    const candidate = arr[idx];
    if (!candidate) return null;
    const shape = tabularShape(candidate);
    if (!shape) return null;
    const next = arr[idx + 1];
    if (!next) return null;
    const nextCount = next.split(shape.delim).length - 1;
    // Tolerancia holgada a propósito: equivocarse por exceso solo repite una
    // fila que luego deduplica `dedupeByLabel`, mientras que equivocarse por
    // defecto deja al modelo sin nombres de columna, que es el defecto grave.
    return nextCount >= 1 && Math.abs(nextCount - shape.count) <= 2 ? candidate : null;
  };

  let header = pickHeaderAt(lines, i);
  const body = lines.slice(header ? i + 1 : i);

  const chunks: ExtractChunk[] = [];
  let current: string[] = [];
  let currentChars = 0;
  let first = true;

  const flush = () => {
    if (current.length === 0) return;
    const head = [...(first ? prelude : []), ...(header ? [header] : [])];
    chunks.push({ text: [...head, ...current].join("\n"), rows: current.length });
    first = false;
    current = [];
    currentChars = 0;
  };

  for (let k = 0; k < body.length; k++) {
    const line = body[k];

    // Cambio de hoja dentro del mismo archivo: cada hoja trae SUS columnas, así
    // que se cierra el trozo y se adopta el encabezado nuevo. Sin esto, las
    // filas de la Hoja 2 se explicaban con los nombres de columna de la Hoja 1.
    if (SHEET_RE.test(line.trim())) {
      flush();
      const nextHeader = pickHeaderAt(body, k + 1);
      if (nextHeader) {
        header = nextHeader;
        k++; // la fila de columnas no es un dato
      } else {
        header = null;
      }
      continue;
    }

    // Una sola línea gigantesca (un PDF entero en un renglón) no se puede
    // trocear por filas; se manda sola y se corta al tope para no reventar.
    if (line.length > maxChars) {
      flush();
      const head = [...(first ? prelude : []), ...(header ? [header] : [])];
      chunks.push({ text: [...head, line.slice(0, maxChars)].join("\n"), rows: 1 });
      first = false;
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
