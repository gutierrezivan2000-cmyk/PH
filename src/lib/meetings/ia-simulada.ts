/**
 * Un «modelo» simulado para pruebas: responde como lo haría Claude con las instrucciones de `ficha.ts`, pero con reglas
 * fijas sobre el texto que recibe. Así las pruebas de punta a punta comprueban el recorrido entero (bloques → ficha →
 * hablantes → costos → correo) sin red y sabiendo cuál debe ser el resultado.
 *
 * Lee del prompt lo mismo que leería el modelo: las líneas `[hh:mm:ss] V1: texto` del fragmento, y para la ficha, el JSON de
 * lo extraído. Reconoce:
 *  - «aprobado» → una decisión; «pendiente» → un compromiso; «votación» → una votación;
 *  - «Frase 12 de Martha:» (el guion sintético firma cada frase) → una pista: esa etiqueta es Martha.
 */
import { ESQUEMA_BLOQUE, ESQUEMA_FICHA } from "./ficha";
import { calcularUso, type ClienteIA, type EntradaIA, type RespuestaIA } from "./ia";

const LINEA = /^\[(\d{2}):(\d{2}):(\d{2})\] (\S+?): (.*)$/;
const segundos = (h: string, m: string, s: string) => Number(h) * 3600 + Number(m) * 60 + Number(s);
const palabras = (t: string, n: number) => t.split(/\s+/).slice(0, n).join(" ");

export type OpcionesIASimulada = {
  modelo?: string;
  /** Se llama antes de responder; si lanza, esa es la respuesta. `n` es el número de llamada (desde 1). */
  alLlamar?: (entrada: EntradaIA, n: number) => void | Promise<void>;
};

export type IASimulada = ClienteIA & { llamadas: EntradaIA[] };

function responderBloque(usuario: string): unknown {
  const lineas = usuario.slice(usuario.indexOf("Transcripción:")).split("\n").flatMap((l) => {
    const m = LINEA.exec(l);
    return m ? [{ t: segundos(m[1], m[2], m[3]), etiqueta: m[4], texto: m[5] }] : [];
  });
  const fragmento = /Fragmento (\d+) de (\d+)/.exec(usuario);
  const vistas = new Set<string>();
  const pistas = lineas.flatMap((l) => {
    const firma = /^Frase \d+ de (\S+?):/.exec(l.texto);
    if (!firma || vistas.has(l.etiqueta)) return [];
    vistas.add(l.etiqueta);
    return [{ etiqueta: l.etiqueta, nombre: firma[1], rol: null, evidencia: `La frase se firma «${palabras(l.texto, 4)}…»`, t: l.t }];
  });
  return {
    temas: lineas.length
      ? [{ titulo: `Fragmento ${fragmento?.[1] ?? "?"}`, inicioS: lineas[0].t, finS: lineas[lineas.length - 1].t, resumen: `Se trataron ${lineas.length} intervenciones.` }]
      : [],
    decisiones: lineas.filter((l) => /aprobado/i.test(l.texto)).map((l) => ({ t: l.t, texto: `Se aprobó lo dicho en: ${palabras(l.texto, 10)}` })),
    compromisos: lineas.filter((l) => /pendiente/i.test(l.texto)).map((l) => ({ t: l.t, texto: `Resolver lo pendiente de: ${palabras(l.texto, 10)}`, responsable: null, fecha: null })),
    votaciones: lineas.filter((l) => /votaci[oó]n/i.test(l.texto)).map((l) => ({ t: l.t, asunto: palabras(l.texto, 8), aFavor: 3, enContra: 0, abstenciones: null, resultado: "Aprobada" })),
    cifras: [],
    pistasHablantes: pistas,
  };
}

function responderFicha(usuario: string): unknown {
  const datos = JSON.parse(usuario.slice(usuario.indexOf('{"temas"'))) as {
    temas: Array<{ titulo: string; inicioS: number }>;
    decisiones: unknown[];
    compromisos: unknown[];
    pistasHablantes: Array<{ etiqueta: string; nombre?: string; evidencia: string; t: number }>;
  };
  const primeraPista = new Map<string, (typeof datos.pistasHablantes)[number]>();
  for (const p of datos.pistasHablantes) if (p.nombre && !primeraPista.has(p.etiqueta)) primeraPista.set(p.etiqueta, p);
  const nombres = [...new Set([...primeraPista.values()].map((p) => p.nombre as string))];
  return {
    resumen: `Resumen simulado: ${datos.temas.length} temas, ${datos.decisiones.length} decisiones y ${datos.compromisos.length} compromisos.`,
    ordenDelDia: datos.temas.map((t) => ({ titulo: t.titulo, inicioS: t.inicioS })),
    asistentes: nombres.map((nombre) => ({ nombre, rol: null })),
    pendientes: ["No se mencionó el lugar de la reunión."],
    hablantes: [...primeraPista.values()].map((p) => ({
      etiqueta: p.etiqueta, nombreSugerido: p.nombre ?? null, rol: null, confianza: "alta", evidencia: p.evidencia, t: p.t, igualA: null,
    })),
  };
}

export function crearIASimulada({ modelo = "claude-opus-5-5", alLlamar }: OpcionesIASimulada = {}): IASimulada {
  const llamadas: EntradaIA[] = [];
  return {
    llamadas,
    async generarJson(entrada: EntradaIA): Promise<RespuestaIA> {
      llamadas.push(entrada);
      await alLlamar?.(entrada, llamadas.length);
      const json = entrada.esquema === ESQUEMA_BLOQUE ? responderBloque(entrada.usuario) : entrada.esquema === ESQUEMA_FICHA ? responderFicha(entrada.usuario) : {};
      const uso = calcularUso({ model: modelo, usage: { input_tokens: Math.ceil((entrada.sistema.length + entrada.usuario.length) / 4), output_tokens: Math.ceil(JSON.stringify(json).length / 4) } }, modelo);
      return { json, uso, modelo, conRespaldo: false };
    },
  };
}
