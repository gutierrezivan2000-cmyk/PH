/**
 * Fechas y horas de Reuniones, escritas a mano.
 *
 * Sin `Intl`: su salida cambia con la versión de ICU (espacios finos, puntos en
 * las abreviaturas) y entre servidor y navegador, que es justo lo que rompe la
 * hidratación. Todo se escribe en la hora LOCAL de quien mira: una reunión a las
 * 7:00 p. m. en Bogotá se ve a las 7:00 p. m. en Bogotá.
 */

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const NBSP = " ";

function leer(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «12 oct» (este año) o «12 oct 2025» (otro año). `ahora` es solo para poder probarlo. */
export function fechaCorta(iso: string, ahora: Date = new Date()): string {
  const d = leer(iso);
  if (!d) return "—";
  const base = `${d.getDate()}${NBSP}${MESES_CORTOS[d.getMonth()]}`;
  return d.getFullYear() === ahora.getFullYear() ? base : `${base}${NBSP}${d.getFullYear()}`;
}

/** «12 de octubre de 2026». */
export function fechaLarga(iso: string): string {
  const d = leer(iso);
  if (!d) return "—";
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** «7:00 p. m.». */
export function horaCorta(iso: string): string {
  const d = leer(iso);
  if (!d) return "—";
  const h = d.getHours();
  const minutos = String(d.getMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${minutos}${NBSP}${h < 12 ? "a. m." : "p. m."}`;
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Valor para un `<input type="datetime-local">` en hora local: «2026-10-12T19:00». */
export function aValorLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}T${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`;
}

/** Lo inverso: el valor de un `datetime-local` (hora local) → fecha, o null si está vacío o es inválido. */
export function deValorLocal(valor: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ════════════════════════════════════════════════════════════════════
   Subida: velocidad, tiempo restante y avance
   ════════════════════════════════════════════════════════════════════ */

/** «12.3 MB/s» (mismo estilo de decimales que el peso de los archivos); nada si no hay una velocidad fiable. */
export function formatearVelocidad(bytesPorSegundo: number | null | undefined): string {
  if (!bytesPorSegundo || !Number.isFinite(bytesPorSegundo) || bytesPorSegundo <= 0) return "";
  const kb = bytesPorSegundo / 1024;
  if (kb < 1000) return `${Math.max(1, Math.round(kb))} KB/s`;
  return `${(kb / 1024).toFixed(1)} MB/s`;
}

/** Tiempo que falta, redondeado hacia arriba y sin segundos: «menos de 1 min», «3 min», «1 h 5 min». */
export function formatearRestante(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos) || segundos < 0) return "";
  if (segundos <= 60) return "menos de 1 min";
  const minutos = Math.ceil(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Cuánto pasó desde `iso`, para leer: «hace unos segundos», «hace 3 min», «hace 2 h», «hace 3 días». */
export function haceCuanto(iso: string, ahora: Date = new Date()): string {
  const d = leer(iso);
  if (!d) return "";
  const segundos = Math.max(0, Math.round((ahora.getTime() - d.getTime()) / 1000));
  if (segundos < 45) return "hace unos segundos";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}
