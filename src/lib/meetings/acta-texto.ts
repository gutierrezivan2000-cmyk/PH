/**
 * Lo que comparten el servidor y la pantalla del acta, sin los prompts: los marcadores con que la IA ata el texto a la
 * reunión (`[[D3]]` decisión, `[[C2]]` compromiso, `[[t=01:23:45]]` minuto del audio), las horas y el «markdown seguro»
 * (`&`, `<` y `>` siempre como entidades). `acta.ts` lo reexporta: el motor del acta y las pruebas siguen importando de allí.
 */
import { formatearReloj } from "./tipos";

/* ════════════════════════════════════════════════════════════════════
   Marcadores
   ════════════════════════════════════════════════════════════════════ */

/** `[[D3]]`, `[[C2]]`, `[[t=01:23:45]]` (la hora puede traer un solo dígito: `[[t=1:23:45]]`). */
const MARCADOR = /\[\[(D\d{1,4}|C\d{1,4}|t=\d{1,3}:\d{2}:\d{2})\]\]/g;

export const PENDIENTE = "[PENDIENTE DE COMPLETAR]";

/** «1:05:30» → 3930; null si no es una hora. */
export function segundosDeHora(texto: string): number | null {
  const m = /^(\d{1,3}):(\d{2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const min = Number(m[2]);
  const s = Number(m[3]);
  if (min > 59 || s > 59) return null;
  return Number(m[1]) * 3600 + min * 60 + s;
}

/** 3930 → «01:05:30». */
export const horaDeSegundos = (segundos: number): string => formatearReloj(Math.max(0, Math.round(segundos)) * 1000);

export const marcaDeTiempo = (segundos: number): string => `[[t=${horaDeSegundos(segundos)}]]`;

export type MarcadoresDeUnTexto = { decisiones: string[]; compromisos: string[]; segundos: number[] };

/** Lo que cita un texto: los identificadores de decisiones y compromisos y los minutos (sin repetir, en orden de aparición). */
export function marcadoresDe(texto: string): MarcadoresDeUnTexto {
  const salida: MarcadoresDeUnTexto = { decisiones: [], compromisos: [], segundos: [] };
  for (const m of texto.matchAll(MARCADOR)) {
    const v = m[1];
    if (v.startsWith("D")) {
      if (!salida.decisiones.includes(v)) salida.decisiones.push(v);
    } else if (v.startsWith("C")) {
      if (!salida.compromisos.includes(v)) salida.compromisos.push(v);
    } else {
      const s = segundosDeHora(v.slice(2));
      if (s !== null && !salida.segundos.includes(s)) salida.segundos.push(s);
    }
  }
  return salida;
}

/**
 * El texto sin marcadores, listo para exportar. El marcador se lleva su espacio de antes (no queda «aprobada. »), y una
 * línea que EMPEZABA con un marcador no queda con un espacio al principio. La estructura (tablas, listas) no se toca.
 */
export function quitarMarcadores(texto: string): string {
  return texto
    .split("\n")
    .map((linea) => {
      if (!linea.includes("[[")) return linea;
      const empezabaConMarcador = /^\s*(?:[-*]\s+|\d+[.)]\s+)?\[\[/.test(linea);
      let limpia = linea.replace(/[ \t]*\[\[(?:D\d{1,4}|C\d{1,4}|t=\d{1,3}:\d{2}:\d{2})\]\]/g, "");
      if (empezabaConMarcador) limpia = limpia.replace(/^(\s*(?:[-*]\s+|\d+[.)]\s+)?)\s+/, "$1");
      return limpia.replace(/\s+([.,;:])/g, "$1").replace(/[ \t]+$/, "");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/* ════════════════════════════════════════════════════════════════════
   HTML seguro
   ════════════════════════════════════════════════════════════════════ */

/**
 * El acta se publica como HTML (`generatePdfHtml` no escapa el contenido: convierte markdown a propósito). Por eso todo texto
 * del acta es «markdown seguro»: `&`, `<` y `>` van siempre como entidades. Lo que redacta la IA se escapa en `limpiarSeccion`;
 * lo que arma el sistema con datos de la ficha o de la copropiedad, en `armarActa`.
 */
export const escaparHtml = (texto: string): string => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Lo contrario de `escaparHtml`: para mostrar el texto en pantalla (React ya escapa) o guardarlo como markdown plano. */
export const desescaparHtml = (texto: string): string => texto.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
