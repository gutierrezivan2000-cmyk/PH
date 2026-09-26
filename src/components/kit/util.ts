/** Une clases condicionales: unir("k-btn", activo && "k-sec", className). */
export function unir(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(" ");
}

const PREFIJOS = /^(conjunto residencial|conjunto|edificio|urbanizaci[oó]n)\s+/i;

/**
 * Nombre corto de una copropiedad para cornisa, fichas y celdas estrechas
 * (SPEC §f.1): quita el prefijo genérico. «Conjunto Residencial Los Pinos» →
 * «Los Pinos». Si el nombre queda vacío, devuelve el original. Muestra siempre
 * el nombre completo en `title`/`aria-label`.
 * Si tras el prefijo viene «del/de la…» («Conjunto del Parque») se deja entero.
 */
export function nombreCorto(nombre: string): string {
  const limpio = nombre.trim();
  const m = limpio.match(PREFIJOS);
  if (!m) return limpio;
  const resto = limpio.slice(m[0].length).trim();
  if (!resto || /^(del|de la|de los|de las|de)\b/i.test(resto)) return limpio;
  return resto;
}

/** Peso legible con formato de Colombia: 1843200 → «1,8 MB», 655360 → «640 KB». */
export function pesoLegible(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  const num = mb < 10 ? mb.toFixed(1) : Math.round(mb).toString();
  return `${num.replace(".", ",")} MB`;
}

/** Tipo de archivo en mono a partir del nombre: «acta.pdf» → «PDF», «x.xlsx» → «XLS». */
export function tipoDeArchivo(nombre: string): string {
  const ext = (nombre.split(".").pop() || "").toLowerCase();
  const mapa: Record<string, string> = {
    xlsx: "XLS", xls: "XLS", csv: "CSV", docx: "DOC", doc: "DOC", pdf: "PDF",
    jpeg: "JPG", jpg: "JPG", png: "PNG", heic: "HEIC", webp: "IMG", m4a: "M4A",
    mp3: "MP3", wav: "WAV", ogg: "OGG", webm: "WEBM", mp4: "MP4", pptx: "PPT", ppt: "PPT", txt: "TXT",
  };
  return mapa[ext] ?? (ext ? ext.slice(0, 4).toUpperCase() : "ARCH");
}
