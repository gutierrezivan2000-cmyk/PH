/**
 * Las horas de reuniones tal como se escriben en Suscripción (puro: se prueba sin React). La tarjeta de uso dibuja lo que esto decide.
 */
import type { HorasDeReunionesDTO } from "./dto";
import { formatearDuracion } from "./tipos";

const HORA_MS = 3_600_000;

/** «3 h 30 min», y «0 h» cuando no se ha usado nada (`formatearDuracion` dice «—» para cero). */
const horas = (ms: number): string => (ms > 0 ? formatearDuracion(ms) : "0 h");

export type HorasEnPantalla =
  | {
      /** Sin tope: solo se dice cuántas horas lleva. */
      ilimitado: true;
      etiqueta: string;
      cifra: string;
      nota: string;
    }
  | {
      ilimitado: false;
      /** El rótulo de la fila del medidor. */
      etiqueta: string;
      /** «3 h 30 min de 10 h». */
      cifra: string;
      /** Lo que queda, en una frase («Horas: quedan 6 h 30 min este mes.»), o que se acabaron. */
      resumen: string;
      /** Ya no queda nada. */
      agotado: boolean;
      /** Lo usado y el tope, en horas, para llenar las celdas del medidor. */
      usadoHoras: number;
      totalHoras: number;
    };

export function horasEnPantalla(h: HorasDeReunionesDTO): HorasEnPantalla {
  if (h.ilimitado || h.limiteMs === null) {
    return { ilimitado: true, etiqueta: "Horas de reuniones este mes", cifra: horas(h.usadoMs), nota: "Sin tope de horas durante la fase de prueba." };
  }
  const cuando = h.periodo === "mes" ? "este mes" : "en la prueba";
  const restanMs = h.restanMs ?? Math.max(0, h.limiteMs - h.usadoMs);
  const agotado = restanMs <= 0;
  return {
    ilimitado: false,
    etiqueta: h.periodo === "mes" ? "Horas este mes" : "Horas de la prueba",
    cifra: `${horas(h.usadoMs)} de ${horas(h.limiteMs)}`,
    resumen: agotado ? `Ya usaste las ${horas(h.limiteMs)} de reuniones ${h.periodo === "mes" ? "de este mes" : "de la prueba"}.` : `Horas: quedan ${horas(restanMs)} ${cuando}.`,
    agotado,
    usadoHoras: h.usadoMs / HORA_MS,
    totalHoras: h.limiteMs / HORA_MS,
  };
}
