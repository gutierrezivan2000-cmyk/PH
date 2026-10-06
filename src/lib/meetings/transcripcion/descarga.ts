/** Lo que rodea a la transcripción cuando se descarga como texto: el nombre del archivo y el encabezado. */

/** `transcripcion-reunion-de-consejo-septiembre.txt`: ASCII, sin espacios, para cualquier sistema. */
export function nombreDeArchivoDeTranscripcion(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `transcripcion-${base || "reunion"}.txt`;
}

/** Tres líneas y una en blanco: título, datos de la reunión y cuánto de la grabación quedó transcrito. */
export function encabezadoDeTranscripcion({ titulo, detalle, cobertura }: { titulo: string; detalle: string; cobertura: number | null }): string {
  const lineas = [titulo.replace(/\s+/g, " ").trim() || "Reunión"];
  if (detalle) lineas.push(detalle);
  lineas.push(cobertura === null ? "Transcripción completa" : `Transcripción completa · cobertura ${Math.round(cobertura * 100)} %`);
  return `${lineas.join("\n")}\n\n`;
}
