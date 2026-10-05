/**
 * Un «modelo» simulado para pruebas: responde como lo haría Claude con las instrucciones de `ficha.ts`, pero con reglas
 * fijas sobre el texto que recibe. Así las pruebas de punta a punta comprueban el recorrido entero (bloques → ficha →
 * hablantes → costos → correo) sin red y sabiendo cuál debe ser el resultado.
 *
 * Lee del prompt lo mismo que leería el modelo: las líneas `[hh:mm:ss] V1: texto` del fragmento, y para la ficha, el JSON de
 * lo extraído. Reconoce:
 *  - «aprobado» → una decisión; «pendiente» → un compromiso; «votación» → una votación;
 *  - «Frase 12 de Martha:» (el guion sintético firma cada frase) → una pista: esa etiqueta es Martha.
 *
 * Para el texto (el acta y «Preguntar») lee la transcripción y la leyenda de voces del prefijo compartido y el pedido de la
 * sección, y escribe lo mismo que pediría el sistema: una frase por intervención con su minuto, y cada decisión o compromiso
 * pedido con su marcador. Simula también la caché de 1 h: el primer prefijo que ve (o el que se calienta) se «escribe» y los
 * siguientes se «leen», para que las pruebas puedan comprobar que el costo de la transcripción se paga una sola vez.
 */
import { PENDIENTE, horaDeSegundos, marcaDeTiempo, segundosDeHora } from "./acta";
import { ESQUEMA_BLOQUE, ESQUEMA_FICHA } from "./ficha";
import { calcularUso, type ClienteIA, type EntradaDeCalentamiento, type EntradaIA, type EntradaTexto, type RespuestaIA, type RespuestaTexto, type UsoIA } from "./ia";

const LINEA = /^\[(\d{2}):(\d{2}):(\d{2})\] (\S+?): (.*)$/;
const segundos = (h: string, m: string, s: string) => Number(h) * 3600 + Number(m) * 60 + Number(s);
const palabras = (t: string, n: number) => t.split(/\s+/).slice(0, n).join(" ");

export type OpcionesIASimulada = {
  modelo?: string;
  /** Se llama antes de responder; si lanza, esa es la respuesta. `n` es el número de llamada (desde 1). */
  alLlamar?: (entrada: EntradaIA, n: number) => void | Promise<void>;
  /** Lo mismo para las llamadas de texto (el acta y las preguntas). */
  alLlamarTexto?: (entrada: EntradaTexto, n: number) => void | Promise<void>;
  /** Lo mismo para el calentamiento de la caché. */
  alCalentar?: (entrada: EntradaDeCalentamiento, n: number) => void | Promise<void>;
  /** Identificadores (D1, C3…) que el «modelo» se «olvida» de recoger en el acta: para probar la verificación. */
  olvidar?: readonly string[];
  /** Una pausa entre trozo y trozo de lo que escribe (el demo la usa para que se vea escribir). */
  pausaEntreTrozosMs?: number;
};

export type IASimulada = ClienteIA & { llamadas: EntradaIA[]; textos: EntradaTexto[]; calentamientos: EntradaDeCalentamiento[] };

/* ════════════════════════════════════════════════════════════════════
   Texto: el acta y las preguntas
   ════════════════════════════════════════════════════════════════════ */

const LINEA_DE_TRANSCRIPCION = /^\[(\d{1,3}:\d{2}:\d{2})\] ([VH]\d+): (.*)$/;

export type LineaLeida = { s: number; etiqueta: string; texto: string };

/** Las líneas `[hh:mm:ss] V1: texto` de un prefijo compartido. */
export function leerTranscripcion(compartido: string): LineaLeida[] {
  return compartido.split("\n").flatMap((l) => {
    const m = LINEA_DE_TRANSCRIPCION.exec(l);
    const s = m ? segundosDeHora(m[1]) : null;
    return m && s !== null ? [{ s, etiqueta: m[2], texto: m[3] }] : [];
  });
}

/** La leyenda `V1 = Martha López (Presidente)`: etiqueta → nombre. Las voces sin nombre no salen. */
export function leerLeyenda(compartido: string): Map<string, string> {
  const nombres = new Map<string, string>();
  for (const m of compartido.matchAll(/^([VH]\d+) = (.+)$/gm)) {
    if (m[2].startsWith("(")) continue;
    nombres.set(m[1], m[2].replace(/\s+\([^()]*\)$/, "").trim());
  }
  return nombres;
}

const recortar = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`);
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (t: string) => Math.ceil(t.length / 4);
const PALABRAS_VACIAS = new Set(["cual", "cuales", "como", "cuando", "donde", "quien", "quienes", "sobre", "para", "que", "los", "las", "una", "uno", "unos", "unas", "del", "con", "por", "fue", "fueron", "hay", "dice", "dijo", "reunion", "quedaron"]);

/** `n` elementos repartidos a lo largo de la lista (el primero y el último incluidos). */
function repartidos<T>(items: readonly T[], n: number): T[] {
  if (items.length <= n) return [...items];
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]);
}

/**
 * Lo que «redactaría el modelo» para una sección del acta: lee la transcripción y la leyenda del prefijo compartido y el pedido de
 * la sección, y escribe lo que ese pedido manda. Lo usan las pruebas y el modo demo (que muestra un acta real sin llamar a la IA).
 */
export function textoDeSeccionSimulado(compartido: string, pedido: string, olvidar: ReadonlySet<string> = new Set()): string {
  const titulo = /del acta: «(.+?)»\./.exec(pedido)?.[1] ?? "esta parte de la reunión";
  const rango = /de (\d{1,3}:\d{2}:\d{2}) a (\d{1,3}:\d{2}:\d{2})/.exec(pedido);
  const desde = rango ? (segundosDeHora(rango[1]) ?? 0) : 0;
  const hasta = rango ? (segundosDeHora(rango[2]) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const nombres = leerLeyenda(compartido);
  const quien = (etiqueta: string) => nombres.get(etiqueta) ?? "un asistente";

  const lineas = leerTranscripcion(compartido).filter((l) => l.s >= desde && l.s < hasta);
  const parrafos = [`${marcaDeTiempo(desde)} En este punto se trató: ${titulo}.`];
  for (const l of repartidos(lineas, 4)) {
    parrafos.push(`${quien(l.etiqueta)} manifiesta que «${recortar(l.texto, 150)}». ${marcaDeTiempo(l.s)}`);
  }

  const requeridos = [...pedido.matchAll(/^- \[\[([DC]\d+)\]\] «(.*?)»(?: — responsable: (.*?))?(?: — fecha: (.*?))? \(minuto (\d{1,3}:\d{2}:\d{2})\)$/gm)];
  for (const [, id, texto, responsable, fecha, minuto] of requeridos) {
    if (olvidar.has(id)) continue;
    const t = segundosDeHora(minuto) ?? desde;
    parrafos.push(
      id.startsWith("D")
        ? `Se deja constancia de la decisión: **${texto}** [[${id}]] ${marcaDeTiempo(t)}`
        : `Se asume el compromiso: **${texto}**${responsable ? `, a cargo de ${responsable}` : ""}${fecha ? `, con fecha ${fecha}` : ""}. [[${id}]] ${marcaDeTiempo(t)}`,
    );
  }
  if (lineas.length === 0) parrafos.push(`No hay intervenciones registradas en este tramo. ${PENDIENTE}`);
  return parrafos.join("\n\n");
}

const responderSeccion = (entrada: EntradaTexto, olvidar: ReadonlySet<string>): string =>
  textoDeSeccionSimulado(entrada.compartido, entrada.turnos[entrada.turnos.length - 1].texto, olvidar);

/** Lo que contestaría «Preguntar»: lo que más se parece a la pregunta, citado con su hora entre corchetes. */
function responderPregunta(entrada: EntradaTexto): string {
  const pregunta = entrada.turnos[entrada.turnos.length - 1].texto;
  const palabras = [...new Set(sinTildes(pregunta).split(/[^a-z0-9]+/).filter((p) => p.length >= 4 && !PALABRAS_VACIAS.has(p)))];
  const nombres = leerLeyenda(entrada.compartido);
  const quien = (etiqueta: string) => nombres.get(etiqueta) ?? "Una persona";
  const aciertos = leerTranscripcion(entrada.compartido)
    .map((l) => ({ l, n: palabras.filter((p) => sinTildes(l.texto).includes(p)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.l.s - b.l.s)
    .slice(0, 3)
    .sort((a, b) => a.l.s - b.l.s);
  if (aciertos.length === 0) return "No encuentro eso en la reunión: no aparece en la transcripción.";
  return `Según la reunión:\n\n${aciertos.map(({ l }) => `- ${quien(l.etiqueta)} dijo: «${recortar(l.texto, 200)}» [${horaDeSegundos(l.s)}]`).join("\n")}`;
}

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

export function crearIASimulada({ modelo = "claude-opus-5-5", alLlamar, alLlamarTexto, alCalentar, olvidar = [], pausaEntreTrozosMs = 0 }: OpcionesIASimulada = {}): IASimulada {
  const llamadas: EntradaIA[] = [];
  const textos: EntradaTexto[] = [];
  const calentamientos: EntradaDeCalentamiento[] = [];
  const olvidados = new Set(olvidar);
  /** Los prefijos que ya están «en la caché de 1 h»: los escribió un calentamiento o la primera llamada que los trajo. */
  const enCache = new Set<string>();

  /** El uso de una llamada de texto: lo compartido se escribe la primera vez y después se lee. */
  function usoDeTexto(entrada: Pick<EntradaTexto, "sistema" | "compartido">, pedido: string, respuesta: string): UsoIA {
    const compartido = tokens(entrada.sistema) + tokens(entrada.compartido);
    const huboCache = enCache.has(entrada.compartido);
    enCache.add(entrada.compartido);
    return calcularUso(
      {
        model: modelo,
        usage: {
          input_tokens: tokens(pedido),
          output_tokens: tokens(respuesta),
          cache_read_input_tokens: huboCache ? compartido : 0,
          cache_creation_input_tokens: huboCache ? 0 : compartido,
          cache_creation: { ephemeral_1h_input_tokens: huboCache ? 0 : compartido },
        },
      },
      modelo,
    );
  }

  return {
    llamadas,
    textos,
    calentamientos,
    async generarJson(entrada: EntradaIA): Promise<RespuestaIA> {
      llamadas.push(entrada);
      await alLlamar?.(entrada, llamadas.length);
      const json = entrada.esquema === ESQUEMA_BLOQUE ? responderBloque(entrada.usuario) : entrada.esquema === ESQUEMA_FICHA ? responderFicha(entrada.usuario) : {};
      const uso = calcularUso({ model: modelo, usage: { input_tokens: Math.ceil((entrada.sistema.length + entrada.usuario.length) / 4), output_tokens: Math.ceil(JSON.stringify(json).length / 4) } }, modelo);
      return { json, uso, modelo, conRespaldo: false };
    },

    async generarTexto(entrada: EntradaTexto): Promise<RespuestaTexto> {
      textos.push(entrada);
      await alLlamarTexto?.(entrada, textos.length);
      const ultimo = entrada.turnos[entrada.turnos.length - 1].texto;
      const texto = ultimo.startsWith("Redacta SOLO la sección") ? responderSeccion(entrada, olvidados) : responderPregunta(entrada);
      if (entrada.alTexto) {
        for (let i = 0; i < texto.length; i += 24) {
          entrada.alTexto(texto.slice(i, i + 24));
          if (pausaEntreTrozosMs > 0) await new Promise((r) => setTimeout(r, pausaEntreTrozosMs));
        }
      }
      return { texto, uso: usoDeTexto(entrada, entrada.turnos.map((t) => t.texto).join("\n"), texto), modelo, conRespaldo: false, cortada: false };
    },

    async calentar(entrada: EntradaDeCalentamiento): Promise<{ uso: UsoIA; modelo: string }> {
      calentamientos.push(entrada);
      await alCalentar?.(entrada, calentamientos.length);
      return { uso: usoDeTexto(entrada, "", ""), modelo };
    },
  };
}
