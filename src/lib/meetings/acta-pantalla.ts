/**
 * Lo que la pestaña «Acta» decide con lo que le cuenta el servidor (puro: se prueba sin React): qué dice mientras se redacta,
 * cómo resume los requisitos legales y qué marca lleva la pestaña.
 */
import type { ActaDTO, RequisitoActaDTO } from "./dto";

/** Lo que se está haciendo, en una frase. */
export function textoDeEtapaDeActa(acta: Pick<ActaDTO, "etapa" | "secciones">): string {
  if (acta.etapa === "preparando") return "Preparando la transcripción para la IA…";
  if (acta.etapa === "armando") return "Armando el acta y revisando que no falte nada…";
  const s = acta.secciones;
  return s && s.total > 0 ? `Redactando el acta · ${s.hechas} de ${s.total} ${s.total === 1 ? "sección" : "secciones"}` : "Redactando el acta…";
}

/** Los requisitos con los pendientes primero (son los que hay que atender); entre iguales, el orden en que llegaron. */
export const requisitosEnOrden = (requisitos: readonly RequisitoActaDTO[]): RequisitoActaDTO[] =>
  [...requisitos].sort((a, b) => Number(a.status === "completo") - Number(b.status === "completo"));

/** «7 de 10 requisitos completos». */
export function resumenDeRequisitos(requisitos: readonly RequisitoActaDTO[]): { completos: number; total: number; texto: string } {
  const completos = requisitos.filter((r) => r.status === "completo").length;
  const total = requisitos.length;
  return { completos, total, texto: `${completos} de ${total} ${total === 1 ? "requisito" : "requisitos"} ${completos === 1 && total === 1 ? "completo" : "completos"}` };
}

/** Lo que muestra la pestaña «Acta» junto a su nombre: el avance mientras se redacta y una marca si falló. Nada si no hay acta o ya está lista. */
export function marcaDePestanaDeActa(acta: Pick<ActaDTO, "estado" | "progreso"> | null): { conteo: string; titulo: string } | null {
  if (!acta) return null;
  if (acta.estado === "procesando") return { conteo: `${acta.progreso} %`, titulo: `Redactando el acta: ${acta.progreso} %` };
  if (acta.estado === "error") return { conteo: "!", titulo: "El acta no se pudo terminar" };
  return null;
}

/** El acta se puede pedir cuando la reunión está lista (con la reunión procesándose no hay transcripción completa que leer). */
export const sePuedePedirActa = (estadoDeLaReunion: string, tieneTranscripcion = true): boolean => estadoDeLaReunion === "lista" && tieneTranscripcion;
