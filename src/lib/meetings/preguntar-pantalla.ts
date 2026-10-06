/**
 * Lo que la pestaña «Preguntar» decide sin red (puro: se prueba sin React): qué preguntas sugerir, cómo mostrar una respuesta que
 * todavía se está escribiendo y qué parte de la conversación se manda de historial.
 */
import type { Ficha } from "./dto";
import { MAX_TURNOS_DE_HISTORIAL, type TurnoDePreguntar } from "./preguntar-pedido";

/** El título de un tema recortado para caber en una pregunta. */
const cortar = (titulo: string, max = 60): string => {
  const limpio = titulo.replace(/\s+/g, " ").trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
};

/** Hasta cuatro preguntas para empezar: las que sirven para cualquier reunión y una sobre un tema de esta. */
export function sugerenciasDePregunta(ficha: Pick<Ficha, "ordenDelDia" | "votaciones"> | null): string[] {
  const sugerencias = ["¿Qué se decidió en la reunión?"];
  // Un tema concreto (el primero que no es el de apertura ni el de cierre), si hay.
  const temas = [...(ficha?.ordenDelDia ?? [])].filter((t) => t.titulo.trim()).sort((a, b) => a.inicioS - b.inicioS);
  const medios = temas.length > 2 ? temas.slice(1, -1) : temas;
  const tema = medios.find((t) => !/proposicion|varios|cierre|quórum|quorum/i.test(t.titulo)) ?? medios[0];
  if (tema) sugerencias.push(`¿Qué se dijo sobre «${cortar(tema.titulo)}»?`);
  sugerencias.push("¿Qué compromisos quedaron y quién los asumió?");
  sugerencias.push(ficha && ficha.votaciones.length > 0 ? "¿Cómo salieron las votaciones?" : "¿Qué quedó pendiente?");
  return sugerencias.slice(0, 4);
}

/**
 * La respuesta que se está escribiendo, sin lo que todavía no se puede dibujar: un marcador `[[t=00:4` a medio llegar se vería
 * como texto roto un instante. Una respuesta terminada se muestra tal cual.
 */
export const textoEnCurso = (texto: string): string => texto.replace(/\[\[[^\]\n]*\]?$|\[$/, "");

/** Cuánto puede faltar para el final de la página y aun así contar como «sigue al final» (al seguir una respuesta quedan unos píxeles). */
export const MARGEN_DEL_FINAL_PX = 64;

/**
 * ¿La persona subió a releer? La pantalla se movió hacia arriba y no quedó al final de la página. Se mira la posición, además de la
 * rueda, el dedo y el teclado, porque hay formas de subir que no avisan: arrastrar la barra de desplazamiento, por ejemplo. Si la
 * pantalla «subió» pero sigue al final, es que la página se acortó y el navegador la ajustó: eso no es releer.
 */
export const subioAReleer = ({ antes, ahora, maximo }: { antes: number; ahora: number; maximo: number }): boolean =>
  ahora < antes - 1 && maximo - ahora > MARGEN_DEL_FINAL_PX;

export type TurnoDeConversacion =
  | { id: string; rol: "user"; texto: string }
  | {
      id: string;
      rol: "assistant";
      texto: string;
      /** `escribiendo`: llegando; `lista`: terminó; `cortada`: llegó al tope de largo; `detenida`: la persona la paró; `error`: falló (puede traer lo que alcanzó a llegar). */
      estado: "escribiendo" | "lista" | "cortada" | "detenida" | "error";
      /** Por qué falló (solo con `estado: "error"`). */
      error?: string;
    };

/**
 * Lo que se manda de historial: las preguntas que tuvieron su respuesta completa (una respuesta que falló, que se detuvo o que
 * sigue escribiéndose no cuenta), alternadas, las últimas `MAX_TURNOS_DE_HISTORIAL`. La pregunta nueva va aparte.
 */
export function historialParaEnviar(turnos: readonly TurnoDeConversacion[]): TurnoDePreguntar[] {
  const pares: TurnoDePreguntar[] = [];
  for (let i = 0; i + 1 < turnos.length; i++) {
    const pregunta = turnos[i];
    const respuesta = turnos[i + 1];
    if (pregunta.rol === "user" && respuesta.rol === "assistant" && (respuesta.estado === "lista" || respuesta.estado === "cortada") && respuesta.texto.trim()) {
      pares.push({ rol: "user", texto: pregunta.texto }, { rol: "assistant", texto: respuesta.texto });
    }
  }
  return pares.slice(-MAX_TURNOS_DE_HISTORIAL);
}
