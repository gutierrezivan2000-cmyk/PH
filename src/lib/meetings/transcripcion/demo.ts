/**
 * Proveedor de ejemplo (modo demo): responde con la reunión de septiembre de los datos de muestra, sin red ni claves.
 * Corta el guion como lo haría un proveedor real: lo que cae en el audio pedido, con tiempos relativos y las frases de
 * los extremos recortadas, y etiquetas locales («A», «B»…) que cambian de una llamada a otra.
 */
import { SOLAPE_MS, TRAMO_MS } from "../tipos";
import { construirIntervenciones } from "../demo-datos";
import type { OpcionesDeTramo, ProveedorDeTranscripcion, Segmento } from "./tipos";

export function crearProveedorDemo(): ProveedorDeTranscripcion {
  const guion = construirIntervenciones();
  return {
    nombre: "demo",
    modo: "tramos",
    tramoMs: TRAMO_MS,
    solapeMs: SOLAPE_MS,
    costoUsdPorMinuto: 0,
    async transcribirTramo(_audio: Uint8Array, { desdeMs, duracionMs }: OpcionesDeTramo): Promise<Segmento[]> {
      const hasta = desdeMs + duracionMs;
      const etiquetas = new Map<string, string>();
      return guion
        .filter((g) => g.endMs > desdeMs && g.startMs < hasta)
        .map((g) => {
          if (!etiquetas.has(g.speaker)) etiquetas.set(g.speaker, String.fromCharCode(65 + etiquetas.size));
          return {
            inicioMs: Math.max(g.startMs, desdeMs) - desdeMs,
            finMs: Math.min(g.endMs, hasta) - desdeMs,
            hablante: etiquetas.get(g.speaker) as string,
            texto: g.text,
          };
        });
    },
  };
}
