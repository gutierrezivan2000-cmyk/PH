/**
 * El análisis con IA: cada tarea por separado (con la base de datos falsa y el modelo simulado) y, al final, la reunión
 * sintética de casi 50 min recorriendo TODO el camino: audio → tramos → unir → bloques → ficha → lista (con costos y correo).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake, correo } = vi.hoisted(() => ({ fake: { db: null as unknown }, correo: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/email", () => ({ sendMeetingReadyEmail: (...a: unknown[]) => correo(...a) }));

import { AlmacenLocal } from "./almacen-local";
import { analizarBloqueTarea, esfuerzoParaIntento, fichaTarea, leerResultadoDeBloque } from "./analisis";
import { reintentarFallidas } from "./cola";
import type { ContextoTarea } from "./contratos";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { SISTEMA_DE_BLOQUE, SISTEMA_DE_FICHA, bloqueVacio } from "./ficha";
import { ErrorIA, type ClienteIA } from "./ia";
import { crearIASimulada } from "./ia-simulada";
import { MANEJADORES } from "./manejadores";
import { avanzar } from "./orquestador";
import { reanalizarResumen } from "./reanalisis";
import { trabajar } from "./trabajador";
import { crearProveedorOpenAI } from "./transcripcion/openai";
import { audioSintetico, crearSimuladorDeOpenAI, generarGuion, type Intervencion } from "./transcripcion/sintetico";

const S = 1000;
const MIN = 60_000;
const ID = "reunionprueba1";
/** Un cliente de IA a medida solo sabe de JSON: lo que sea de texto no lo usa el análisis. */
const SIN_TEXTO: Pick<ClienteIA, "generarTexto" | "calentar"> = {
  generarTexto: async () => { throw new Error("el análisis no usa texto"); },
  calentar: async () => { throw new Error("el análisis no calienta la caché"); },
};

let db: DbFalsa;

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  correo.mockReset();
  correo.mockResolvedValue({ sent: true });
  vi.stubEnv("MEETINGS_EFFORT", "");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test/");
});
afterEach(() => vi.unstubAllEnvs());

/* ════════════════════════════════════════════════════════════════════
   Cada tarea por separado
   ════════════════════════════════════════════════════════════════════ */

const ctx = (payload: Record<string, unknown>, ia: ClienteIA, intento = 1, extra: Partial<ContextoTarea> = {}): ContextoTarea => ({
  tarea: { id: "x", meetingId: ID, kind: "x", key: "k", payload, attempts: intento },
  presupuestoMs: 230_000,
  senal: new AbortController().signal,
  deps: { almacen: new AlmacenLocal("/tmp/no-se-usa"), ahora: () => new Date(), ia },
  ...extra,
});

async function sembrarReunion() {
  await db.meeting.create({
    data: { id: ID, userId: "u1", propertyId: "prop1", type: "consejo", title: "Reunión de consejo", date: new Date("2026-09-12T19:00:00-05:00"), status: "procesando", durationMs: 100 * MIN, property: { name: "Conjunto Los Pinos" } },
  });
  await db.propertyPerson.create({ data: { propertyId: "prop1", name: "Martha López", role: "presidente", active: true } });
  await db.propertyPerson.create({ data: { propertyId: "prop1", name: "Ya no vive aquí", role: null, active: false } });
  for (const [label, talkMs] of [["V1", 40 * MIN], ["V2", 30 * MIN], ["H5", 5 * MIN]] as const) await db.meetingSpeaker.create({ data: { meetingId: ID, label, talkMs } });
  const lineas: Array<[number, string, string]> = [
    [10 * S, "V1", "Frase 1 de Martha: damos inicio, todo aprobado en el orden del día."],
    [40 * S, "V2", "Frase 2 de Jorge: hay un tema pendiente con los parqueaderos."],
    [20 * MIN, "V1", "Frase 3 de Martha: pasamos a la votación del presupuesto."],
    [26 * MIN, "V2", "Frase 4 de Jorge: segunda parte de la reunión, ya fuera del primer bloque."],
    [60 * MIN, "H5", "Frase 5 de Andrés: una intervención muy tarde."],
  ];
  lineas.forEach(([startMs, speaker, text], idx) => db.meetingUtterance.filas.push({ id: `u${idx}`, meetingId: ID, idx, startMs, endMs: startMs + 5_000, speaker, text }));
  await db.meetingMarker.create({ data: { meetingId: ID, atMs: 20 * MIN, kind: "votacion", note: "Presupuesto" } });
  await db.meetingMarker.create({ data: { meetingId: ID, atMs: 70 * MIN, kind: "tema", note: "Fuera del bloque" } });
}
const bloque0 = { k: 0, total: 3, desdeMs: 0, hastaMs: 25 * MIN };

describe("esfuerzoParaIntento", () => {
  it("el primer intento va con el esfuerzo configurado; los siguientes bajan a «medium», y lo que ya es bajo no sube", () => {
    expect(esfuerzoParaIntento("high", 1)).toBe("high");
    expect(esfuerzoParaIntento("high", 2)).toBe("medium");
    expect(esfuerzoParaIntento("max", 3)).toBe("medium");
    expect(esfuerzoParaIntento("xhigh", 2)).toBe("medium");
    expect(esfuerzoParaIntento("medium", 2)).toBe("medium");
    expect(esfuerzoParaIntento("low", 3)).toBe("low");
  });
});

describe("leerResultadoDeBloque", () => {
  const etiquetas = new Set(["V1"]);
  it("lee un resultado guardado, y uno omitido", () => {
    const ok = leerResultadoDeBloque({ k: 1, desdeMs: 0, hastaMs: 5, bloque: bloqueVacio(), uso: { entrada: 10, salida: 5, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0.5 }, modelo: "claude-opus-5-5" }, etiquetas);
    expect(ok).toMatchObject({ k: 1, uso: { costoUsd: 0.5 }, modelo: "claude-opus-5-5", bloque: bloqueVacio() });
    expect(leerResultadoDeBloque({ k: 2, desdeMs: 5, hastaMs: 9, omitido: "sin saldo", uso: null }, etiquetas)).toMatchObject({ k: 2, omitido: "sin saldo", bloque: undefined, uso: { costoUsd: 0 } });
  });
  it("lo que no cuadra no se puede usar", () => {
    for (const malo of [null, [], "x", { k: "1" }, { k: 1, desdeMs: 0 }, { k: 1, desdeMs: 0, hastaMs: 5, bloque: "no es un objeto" }]) expect(leerResultadoDeBloque(malo, etiquetas)).toBeNull();
  });
});

describe("analizar_bloque", () => {
  it("manda a la IA solo lo que cae en el bloque, con la copropiedad, las personas activas y las marcas, y guarda lo que extrae", async () => {
    await sembrarReunion();
    const ia = crearIASimulada();
    const r = await analizarBloqueTarea(ctx(bloque0, ia));
    expect(ia.llamadas).toHaveLength(1);
    const e = ia.llamadas[0];
    expect(e.sistema).toBe(SISTEMA_DE_BLOQUE);
    expect(e.etiqueta).toBe("el fragmento 1");
    expect(e.timeoutMs).toBeLessThanOrEqual(200_000);
    expect(e.usuario).toContain("Copropiedad: Conjunto Los Pinos");
    expect(e.usuario).toContain("Tipo de reunión: Consejo de administración");
    expect(e.usuario).toContain("Fecha: 12 de septiembre de 2026");
    expect(e.usuario).toContain("- Martha López (Presidente del consejo)");
    expect(e.usuario).not.toContain("Ya no vive aquí");
    expect(e.usuario).toContain("[00:00:10] V1: Frase 1 de Martha");
    expect(e.usuario).toContain("[00:20:00] V1: Frase 3 de Martha");
    expect(e.usuario).not.toContain("Frase 4 de Jorge"); // es del bloque siguiente
    expect(e.usuario).not.toContain("Frase 5 de Andrés");
    expect(e.usuario).toContain("[00:20:00] Votación · Presupuesto");
    expect(e.usuario).not.toContain("Fuera del bloque");
    expect(e.usuario).toContain("Fragmento 1 de 3: de 00:00:00 a 00:25:00.");

    expect(r).toMatchObject({ resultado: { k: 0, desdeMs: 0, hastaMs: 25 * MIN, modelo: "claude-opus-5-5" } });
    const { resultado } = r as { resultado: ReturnType<typeof leerResultadoDeBloque> & { uso: { costoUsd: number } } };
    expect(resultado!.bloque!.decisiones.map((d) => d.t)).toEqual([10]);
    expect(resultado!.bloque!.compromisos.map((c) => c.t)).toEqual([40]);
    expect(resultado!.bloque!.votaciones.map((v) => v.t)).toEqual([1_200]);
    expect(resultado!.bloque!.pistasHablantes.map((p) => [p.etiqueta, p.nombre])).toEqual([["V1", "Martha"], ["V2", "Jorge"]]);
    expect(resultado.uso.costoUsd).toBeGreaterThan(0);
  });

  it("pide el esfuerzo configurado y, en los reintentos, uno más bajo", async () => {
    await sembrarReunion();
    const ia = crearIASimulada();
    await analizarBloqueTarea(ctx(bloque0, ia, 1));
    vi.stubEnv("MEETINGS_EFFORT", "xhigh");
    await analizarBloqueTarea(ctx(bloque0, ia, 1));
    await analizarBloqueTarea(ctx(bloque0, ia, 2));
    expect(ia.llamadas.map((l) => l.esfuerzo)).toEqual(["high", "xhigh", "medium"]);
  });

  it("un bloque sin intervenciones no gasta una llamada", async () => {
    await sembrarReunion();
    const ia = crearIASimulada();
    const r = await analizarBloqueTarea(ctx({ k: 1, total: 3, desdeMs: 30 * MIN, hastaMs: 55 * MIN }, ia));
    expect(ia.llamadas).toHaveLength(0);
    expect(r).toMatchObject({ resultado: { k: 1, bloque: bloqueVacio(), uso: { costoUsd: 0 } } });
  });

  it("si la IA no puede (sin saldo, credenciales, rechazo), el bloque se OMITE y se anota, sin reintentos ni error", async () => {
    await sembrarReunion();
    const ia = crearIASimulada({ alLlamar: () => { throw new ErrorIA("No pudimos analizar la reunión con IA: sin saldo.", { reintentable: false }); } });
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await analizarBloqueTarea(ctx(bloque0, ia, 1));
    expect(r).toMatchObject({ resultado: { k: 0, omitido: "No pudimos analizar la reunión con IA: sin saldo.", uso: { costoUsd: 0 } } });
    expect((r as { resultado: Record<string, unknown> }).resultado).not.toHaveProperty("bloque");
    expect(consola).toHaveBeenCalledTimes(1);
    expect(String(consola.mock.calls[0][0])).not.toContain("Frase"); // el registro no lleva texto de la reunión
    consola.mockRestore();
  });

  it("un fallo del momento sube a la cola mientras queden intentos, y en el último se omite", async () => {
    await sembrarReunion();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ia = crearIASimulada({ alLlamar: () => { throw Object.assign(new Error("overloaded"), { status: 529 }); } });
    await expect(analizarBloqueTarea(ctx(bloque0, ia, 1))).rejects.toMatchObject({ name: "ErrorIA", reintentable: true });
    await expect(analizarBloqueTarea(ctx(bloque0, ia, 2))).rejects.toMatchObject({ reintentable: true });
    const ultimo = await analizarBloqueTarea(ctx(bloque0, ia, 3));
    expect(ultimo).toMatchObject({ resultado: { omitido: expect.stringContaining("saturado") } });
    vi.restoreAllMocks();
  });

  it("una respuesta que no se puede leer se trata como un fallo del momento", async () => {
    await sembrarReunion();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mala: ClienteIA = { ...SIN_TEXTO, generarJson: async () => ({ json: "no es un objeto", uso: { entrada: 1, salida: 1, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0.01 }, modelo: "m", conRespaldo: false }) };
    await expect(analizarBloqueTarea(ctx(bloque0, mala, 1))).rejects.toMatchObject({ reintentable: true, message: expect.stringContaining("formato") });
    expect(await analizarBloqueTarea(ctx(bloque0, mala, 3))).toMatchObject({ resultado: { omitido: expect.stringContaining("formato") } });
    vi.restoreAllMocks();
  });

  it("acota a la IA: lo que devuelve fuera del bloque o con etiquetas inventadas no pasa", async () => {
    await sembrarReunion();
    const ia: ClienteIA = {
      ...SIN_TEXTO,
      generarJson: async (): Promise<Awaited<ReturnType<ClienteIA["generarJson"]>>> => ({
        json: {
          temas: [], compromisos: [], votaciones: [], cifras: [],
          decisiones: [{ t: 99_999, texto: "Una decisión con un minuto imposible." }],
          pistasHablantes: [{ etiqueta: "V9", nombre: "Inventado", rol: null, evidencia: "no existe", t: 100 }, { etiqueta: "H5", nombre: "Andrés", rol: null, evidencia: "lo llaman Andrés", t: 100 }],
        },
        uso: { entrada: 1, salida: 1, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0 }, modelo: "m", conRespaldo: false,
      }),
    };
    const { resultado } = (await analizarBloqueTarea(ctx(bloque0, ia))) as { resultado: ReturnType<typeof leerResultadoDeBloque> };
    expect(resultado!.bloque!.decisiones[0].t).toBe(25 * 60); // acotado al final del bloque
    expect(resultado!.bloque!.pistasHablantes.map((p) => p.etiqueta)).toEqual(["H5"]);
  });

  it("una tarea mal armada es un error definitivo; una reunión que ya no existe, no hace nada", async () => {
    const ia = crearIASimulada();
    await expect(analizarBloqueTarea(ctx({}, ia))).rejects.toMatchObject({ reintentable: false });
    await expect(analizarBloqueTarea(ctx({ k: 0, total: 1, desdeMs: 5, hastaMs: 5 }, ia))).rejects.toMatchObject({ reintentable: false });
    expect(await analizarBloqueTarea(ctx(bloque0, ia))).toEqual({ resultado: { omitida: "la reunión ya no existe" } });
    expect(ia.llamadas).toHaveLength(0);
  });
});

describe("ficha", () => {
  const resultadoDe = (k: number, desdeMs: number, hastaMs: number, extra: Record<string, unknown> = {}) => ({
    k, desdeMs, hastaMs, uso: { entrada: 1_000, salida: 200, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0.01 }, modelo: "claude-opus-5-5", ...extra,
  });
  const conHallazgos = (t0: number): unknown => ({
    ...bloqueVacio(),
    temas: [{ titulo: `Tema de las ${t0}`, inicioS: t0, finS: t0 + 60, resumen: "r" }],
    decisiones: [{ t: t0 + 5, texto: `Aprobar lo discutido a las ${t0} con la cotización presentada` }],
    compromisos: [{ t: t0 + 10, texto: `Enviar el informe pendiente de las ${t0} al consejo` }],
    pistasHablantes: [{ etiqueta: "V1", nombre: "Martha", evidencia: "La llaman presidenta", t: t0 }],
  });
  const tarea = (key: string, result: unknown, status = "hecha") => db.meetingTask.create({ data: { meetingId: ID, kind: "analizar_bloque", key, status, result } });
  type FichaDePrueba = {
    resumen: string;
    decisiones: Array<{ id: string; t: number }>;
    compromisos: Array<{ id: string }>;
    ordenDelDia: Array<{ titulo: string }>;
    pendientes: string[];
    hablantes: unknown[];
  };
  const digest = () => db.meeting.filas[0].digest as FichaDePrueba | null | undefined;

  async function sembrarBloques() {
    await sembrarReunion();
    await tarea("bloque:0", resultadoDe(0, 0, 25 * MIN, { bloque: conHallazgos(100) }));
    await tarea("bloque:1", resultadoDe(1, 25 * MIN, 50 * MIN, { bloque: conHallazgos(1_600) }));
  }

  it("junta los bloques con reglas, pide a la IA el resumen y los nombres, y guarda la ficha y las sugerencias", async () => {
    await sembrarBloques();
    const ia = crearIASimulada();
    const r = await fichaTarea(ctx({}, ia));
    expect(ia.llamadas).toHaveLength(1);
    const e = ia.llamadas[0];
    expect(e.sistema).toBe(SISTEMA_DE_FICHA);
    expect(e.etiqueta).toBe("la ficha de la reunión");
    expect(e.usuario).toContain("Duración de la reunión: 01:40:00.");
    expect(e.usuario).toContain("Voces de la transcripción: V1 (40 min de palabra), V2 (30 min de palabra), H5 (5 min de palabra).");
    expect(e.usuario).not.toContain("NO se pudieron analizar");

    const d = digest()!;
    expect(d.resumen).toBe("Resumen simulado: 2 temas, 2 decisiones y 2 compromisos.");
    expect(d.decisiones.map((x) => [x.id, x.t])).toEqual([["D1", 105], ["D2", 1_605]]);
    expect(d.compromisos.map((x) => x.id)).toEqual(["C1", "C2"]);
    expect(d.pendientes).toEqual(["No se mencionó el lugar de la reunión."]);
    expect(db.meeting.filas[0].errorMessage).toBeNull();

    const v1 = db.meetingSpeaker.filas.find((h) => h.label === "V1")!;
    expect(v1.suggestion).toMatchObject({ nombre: "Martha", confianza: "alta", t: 100 });
    expect(v1).toMatchObject({ name: null, confirmed: false }); // la sugerencia no se aplica sola
    expect(db.meetingSpeaker.filas.find((h) => h.label === "V2")!.suggestion).toBeNull();
    expect(r).toMatchObject({ resultado: { decisiones: 2, compromisos: 2, sugerencias: 1, omitidos: 0, degradada: false, modelo: "claude-opus-5-5" } });
  });

  it("un bloque que no se pudo analizar queda como pendiente y se le dice a la IA que no lo dé por tratado", async () => {
    await sembrarBloques();
    await tarea("bloque:2", resultadoDe(2, 50 * MIN, 75 * MIN, { omitido: "sin saldo", bloque: undefined }));
    const ia = crearIASimulada();
    await fichaTarea(ctx({}, ia));
    expect(ia.llamadas[0].usuario).toContain("NO se pudieron analizar (no los des por tratados): 0:50:00–1:15:00.");
    expect(digest()!.pendientes).toContain("No se pudo analizar con IA el fragmento de 0:50:00 a 1:15:00: revisa la transcripción de ese tramo.");
  });

  it("si la última llamada falla, la ficha se arma con lo ya extraído de los bloques (sin resumen) y la reunión avisa", async () => {
    await sembrarBloques();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ia = crearIASimulada({ alLlamar: () => { throw new ErrorIA("No pudimos analizar la reunión con IA: sin saldo.", { reintentable: false }); } });
    const r = await fichaTarea(ctx({}, ia));
    const d = digest()!;
    expect(d.resumen).toBe("");
    expect(d.decisiones).toHaveLength(2);
    expect(d.ordenDelDia.map((o) => o.titulo)).toEqual(["Tema de las 100", "Tema de las 1600"]);
    expect(d.pendientes).toEqual(["El resumen con IA no se pudo generar: la transcripción está completa y puedes revisarla."]);
    expect(db.meeting.filas[0].errorMessage).toBe("El resumen con IA no se pudo generar: la transcripción está completa y puedes revisarla.");
    expect(db.meetingSpeaker.filas.find((h) => h.label === "V1")!.suggestion).toMatchObject({ nombre: "Martha", confianza: "media" });
    expect(r).toMatchObject({ resultado: { degradada: true, uso: { costoUsd: 0 } } });
    vi.restoreAllMocks();
  });

  it("un fallo del momento sube a la cola mientras queden intentos", async () => {
    await sembrarBloques();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ia = crearIASimulada({ alLlamar: () => { throw Object.assign(new Error("boom"), { status: 503 }); } });
    await expect(fichaTarea(ctx({}, ia, 1))).rejects.toMatchObject({ reintentable: true });
    expect(digest()).toBeUndefined();
    await fichaTarea(ctx({}, ia, 3));
    expect(digest()!.resumen).toBe("");
    vi.restoreAllMocks();
  });

  it("sin ningún bloque analizado (la IA no estuvo disponible) la reunión queda sin ficha y con el motivo", async () => {
    await sembrarReunion();
    await tarea("bloque:0", resultadoDe(0, 0, 25 * MIN, { omitido: "No pudimos analizar la reunión con IA: sin saldo." }));
    const ia = crearIASimulada();
    const r = await fichaTarea(ctx({}, ia));
    expect(ia.llamadas).toHaveLength(0);
    expect(digest()).toBeUndefined();
    expect(db.meeting.filas[0].errorMessage).toBe("No pudimos generar el resumen con IA: No pudimos analizar la reunión con IA: sin saldo.");
    expect(r).toMatchObject({ resultado: { sinFicha: true } });
  });

  it("una conversación sin temas, decisiones ni compromisos no gasta una llamada: queda la ficha mínima con un aviso", async () => {
    await sembrarReunion();
    await tarea("bloque:0", resultadoDe(0, 0, 25 * MIN, { bloque: bloqueVacio() }));
    const ia = crearIASimulada();
    await fichaTarea(ctx({}, ia));
    expect(ia.llamadas).toHaveLength(0);
    expect(digest()!.pendientes).toEqual(["No se identificaron temas, decisiones ni compromisos en la reunión."]);
    expect(db.meeting.filas[0].errorMessage).toBeNull();
  });

  it("descarta lo que la IA sugiere para hablantes que no existen y las fusiones con etiquetas que no existen", async () => {
    await sembrarBloques();
    const ia: ClienteIA = {
      ...SIN_TEXTO,
      generarJson: async () => ({
        json: {
          resumen: "Resumen.", ordenDelDia: [], asistentes: [], pendientes: [],
          hablantes: [
            { etiqueta: "V9", nombreSugerido: "Fantasma", rol: null, confianza: "alta", evidencia: "no existe", t: 5, igualA: null },
            { etiqueta: "H5", nombreSugerido: "Andrés", rol: "Consejero", confianza: "media", evidencia: "Le preguntan «Andrés»", t: 3_000, igualA: "V7" },
          ],
        },
        uso: { entrada: 1, salida: 1, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0 }, modelo: "m", conRespaldo: false,
      }),
    };
    await fichaTarea(ctx({}, ia));
    expect(digest()!.hablantes).toEqual([{ etiqueta: "H5", nombreSugerido: "Andrés", rol: "Consejero", confianza: "media", evidencia: "Le preguntan «Andrés»", t: 3_000 }]);
    expect(db.meetingSpeaker.filas.find((h) => h.label === "H5")!.suggestion).toMatchObject({ nombre: "Andrés", rol: "Consejero", igualA: undefined });
  });

  it("una reunión sin duración espera; una que ya no existe, no hace nada", async () => {
    await db.meeting.create({ data: { id: ID, userId: "u1", propertyId: "p", type: "consejo", date: new Date(), durationMs: null, property: { name: "X" } } });
    await expect(fichaTarea(ctx({}, crearIASimulada()))).rejects.toMatchObject({ reintentable: true });
    db.meeting.filas.length = 0;
    expect(await fichaTarea(ctx({}, crearIASimulada()))).toEqual({ resultado: { omitida: "la reunión ya no existe" } });
  });
});

/* ════════════════════════════════════════════════════════════════════
   El camino completo
   ════════════════════════════════════════════════════════════════════ */

const PERSONAS = ["Martha", "Jorge", "Carolina", "Hernán", "Andrés"];
const DURACION = 2_999_952; // casi 50 min: 5 tramos y 2 bloques de análisis
let carpeta: string;
let almacen: AlmacenLocal;
let guion: Intervencion[];
let audio: Uint8Array;
let t: number;

describe("la reunión sintética, de punta a punta", () => {
  beforeAll(() => {
    carpeta = mkdtempSync(join(tmpdir(), "reunion-analisis-"));
    guion = generarGuion({ duracionMs: DURACION, personas: PERSONAS, pesos: [4, 3, 3, 3, 0.15], semilla: 11 });
    audio = audioSintetico(guion, PERSONAS, DURACION);
  });
  afterAll(() => rmSync(carpeta, { recursive: true, force: true }));
  beforeEach(() => {
    almacen = new AlmacenLocal(join(carpeta, `a-${Math.random().toString(36).slice(2, 8)}`));
    t = Date.now() + 60_000;
  });

  async function reunionConAudio() {
    const subido = await almacen.subir(`meetings/${ID}/audio.mp3`, audio, "audio/mpeg");
    await db.meeting.create({
      data: {
        id: ID, userId: "u1", propertyId: "prop1", type: "consejo", title: "Reunión de consejo — septiembre", date: new Date("2026-09-12T19:00:00-05:00"),
        status: "procesando", stage: "preparando_audio", progress: 0, errorMessage: null, durationMs: DURACION, audioUrl: subido.url, property: { name: "Conjunto Los Pinos" },
      },
    });
    await db.user.create({ data: { id: "u1", email: "ana@ejemplo.com" } });
    await db.meetingSource.create({ data: { id: "s1", meetingId: ID, idx: 0, kind: "archivo", name: "consejo.m4a", url: "https://x/s1", status: "normalizada", normalizedMs: DURACION, durationMs: DURACION, offsetMs: 0 } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "armar_audio", key: "armar_audio", status: "hecha" } });
    await avanzar(ID);
  }
  const proveedor = () => crearProveedorOpenAI({ crear: crearSimuladorDeOpenAI(guion, PERSONAS).crear });
  async function correr(ia: ClienteIA, hasta: () => boolean, maximo = 60) {
    const p = proveedor();
    for (let pasada = 0; pasada < maximo && !hasta(); pasada++) {
      await trabajar({ presupuestoMs: 600_000, margenMinimoMs: 1000, reloj: () => t, manejadores: MANEJADORES, deps: { almacen, proveedor: p, ia } });
      t += 12 * 60_000;
    }
  }
  const reunion = () => db.meeting.filas[0];
  const tarea = (key: string) => db.meetingTask.filas.find((x) => x.key === key);

  it("llega a «lista» con la ficha, los nombres sugeridos, los costos, el registro de uso y UN solo correo", async () => {
    const ia = crearIASimulada();
    await reunionConAudio();
    await correr(ia, () => reunion().status === "lista");

    expect(reunion()).toMatchObject({ status: "lista", stage: null, progress: 100, errorMessage: null });
    const bloques = db.meetingTask.filas.filter((x) => x.kind === "analizar_bloque");
    expect(bloques.length).toBeGreaterThanOrEqual(2);
    expect(bloques.every((b) => b.status === "hecha")).toBe(true);
    expect(tarea("ficha")).toMatchObject({ status: "hecha" });
    // Una llamada por bloque y una por la ficha.
    expect(ia.llamadas).toHaveLength(bloques.length + 1);

    // La ficha: decisiones y compromisos salen de los bloques (los de las frases con «aprobado» y «pendiente»), con sus IDs.
    const d = reunion().digest as { resumen: string; decisiones: Array<{ id: string; t: number }>; compromisos: Array<{ id: string }>; hablantes: Array<{ etiqueta: string; nombreSugerido: string }> };
    expect(d.resumen).toMatch(/^Resumen simulado: \d+ temas/);
    const esperadas = guion.filter((g) => /aprobado/i.test(g.texto));
    expect(d.decisiones.length).toBeGreaterThan(0);
    expect(d.decisiones.length).toBeLessThanOrEqual(esperadas.length);
    expect(d.decisiones.map((x) => x.id)).toEqual(d.decisiones.map((_, i) => `D${i + 1}`));
    expect(d.decisiones.every((x, i) => x.t >= 0 && x.t <= DURACION / 1000 && (i === 0 || x.t >= d.decisiones[i - 1].t))).toBe(true);

    // Los nombres sugeridos son los de las personas de verdad detrás de cada etiqueta.
    const personaDe = new Map<string, string>();
    db.meetingUtterance.filas.forEach((u) => {
      const quien = /^Frase \d+ de (\S+?):/.exec(u.text as string)![1];
      personaDe.set(u.speaker as string, quien);
    });
    for (const h of d.hablantes) expect(h.nombreSugerido, h.etiqueta).toBe(personaDe.get(h.etiqueta));
    for (const e of ["V1", "V2", "V3", "V4"]) {
      const fila = db.meetingSpeaker.filas.find((x) => x.label === e)!;
      expect((fila.suggestion as { nombre: string }).nombre).toBe(personaDe.get(e));
      expect(fila).toMatchObject({ name: null, confirmed: false });
    }

    // Costos y uso: la reunión suma transcripción + IA y deja dos registros.
    const filas = db.meetingTask.filas.map((x) => ({ kind: x.kind as string, result: x.result }));
    const { sumarCostos } = await import("./terminado");
    const c = sumarCostos(filas);
    expect(c.iaUsd).toBeGreaterThan(0);
    expect(reunion().costUsd as number).toBeCloseTo(c.transcripcionUsd + c.iaUsd, 8);
    expect(db.usageRecord.filas.map((x) => [x.type, x.userId])).toEqual([["reunion_audio", "u1"], ["reunion_ia", "u1"]]);
    expect(db.usageRecord.filas[0]).toMatchObject({ tokens: Math.round(DURACION / 1000) });
    expect(db.usageRecord.filas[1].tokens as number).toBeGreaterThan(0);

    // El correo: uno solo, al dueño, con el enlace a la reunión y sin nada del contenido.
    expect(correo).toHaveBeenCalledTimes(1);
    expect(correo).toHaveBeenCalledWith({ to: "ana@ejemplo.com", title: "Reunión de consejo — septiembre", propertyName: "Conjunto Los Pinos", duration: "50 min", url: `https://app.test/dashboard/reuniones/${ID}` });
  });

  it("si la IA no está disponible, la reunión igual queda lista: transcripción completa, sin resumen y con el motivo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ia = crearIASimulada({ alLlamar: () => { throw new ErrorIA("No pudimos analizar la reunión con IA: el servicio no aceptó las credenciales. Avisa a soporte.", { reintentable: false }); } });
    await reunionConAudio();
    await correr(ia, () => reunion().status === "lista" || reunion().status === "error");

    expect(reunion().status).toBe("lista"); // nunca «error» por la IA
    expect(reunion().digest).toBeUndefined();
    expect(reunion().errorMessage).toMatch(/^No pudimos generar el resumen con IA: No pudimos analizar la reunión con IA: el servicio no aceptó las credenciales/);
    expect(db.meetingUtterance.filas.length).toBeGreaterThan(100); // la transcripción está completa
    expect(db.meetingTask.filas.filter((x) => x.kind === "analizar_bloque").every((x) => (x.result as { omitido?: string }).omitido)).toBe(true);
    expect(db.usageRecord.filas.map((x) => x.type)).toEqual(["reunion_audio"]); // sin IA, sin registro de IA
    expect(correo).toHaveBeenCalledTimes(1); // y se avisa igual: la transcripción ya se puede leer
    vi.restoreAllMocks();
  });

  it("un fallo pasajero de la IA se reintenta con espera y la reunión sale con su ficha completa", async () => {
    let fallos = 0;
    const ia = crearIASimulada({ alLlamar: (e, n) => { if (e.esquema && n <= 2 && fallos++ < 2) throw Object.assign(new Error("overloaded"), { status: 529 }); } });
    await reunionConAudio();
    await correr(ia, () => reunion().status === "lista");
    expect(fallos).toBe(2);
    expect(reunion().status).toBe("lista");
    expect(reunion().digest).toBeDefined();
    expect(db.meetingTask.filas.filter((x) => x.kind === "analizar_bloque").every((x) => !(x.result as { omitido?: string }).omitido)).toBe(true);
    expect(correo).toHaveBeenCalledTimes(1);
  });

  it("un fallo del correo no tumba nada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    correo.mockRejectedValue(new Error("Resend caído"));
    await reunionConAudio();
    await correr(crearIASimulada(), () => reunion().status === "lista");
    expect(reunion().status).toBe("lista");
    expect(db.usageRecord.filas).toHaveLength(2);
    vi.restoreAllMocks();
  });

  it("una reunión con casi nada de texto no tiene bloques ni ficha: queda lista de inmediato", async () => {
    // Un solo tramo con unas pocas palabras: planificarBloques devuelve [] y no hay nada que analizar.
    const ia = crearIASimulada();
    const corta = [{ inicioMs: 5_000, finMs: 9_000, quien: "Martha", texto: "Frase 1 de Martha: hola a todos." }];
    const dur = 36 * 1000;
    const cortoAudio = audioSintetico(corta, PERSONAS, dur);
    const subido = await almacen.subir(`meetings/${ID}/audio.mp3`, cortoAudio, "audio/mpeg");
    await db.meeting.create({ data: { id: ID, userId: "u1", propertyId: "p", type: "consejo", title: "Corta", date: new Date(), status: "procesando", durationMs: dur, audioUrl: subido.url, property: { name: "X" } } });
    await db.meetingSource.create({ data: { id: "s1", meetingId: ID, idx: 0, kind: "archivo", name: "a", url: "https://x", status: "normalizada", normalizedMs: dur, durationMs: dur, offsetMs: 0 } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "armar_audio", key: "armar_audio", status: "hecha" } });
    await avanzar(ID);
    const p = crearProveedorOpenAI({ crear: crearSimuladorDeOpenAI(corta, PERSONAS).crear });
    for (let i = 0; i < 10 && reunion().status !== "lista"; i++) {
      await trabajar({ presupuestoMs: 600_000, margenMinimoMs: 1000, reloj: () => t, manejadores: MANEJADORES, deps: { almacen, proveedor: p, ia } });
      t += 12 * 60_000;
    }
    expect(reunion().status).toBe("lista");
    expect(ia.llamadas).toHaveLength(0);
    expect(db.meetingTask.filas.some((x) => x.kind === "analizar_bloque" || x.kind === "ficha")).toBe(false);
  });

  it("«Reintentar» después de un fallo de infraestructura en un bloque retoma solo lo pendiente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const ia = crearIASimulada();
    await reunionConAudio();
    // Un bloque falla por algo que no es de la IA (un error de código/base de datos) las tres veces: la reunión sí queda en error.
    const original = db.meetingUtterance.findMany.bind(db.meetingUtterance);
    let rotas = 0;
    db.meetingUtterance.findMany = (async (a: { where?: { startMs?: unknown } }) => {
      if (a?.where?.startMs && rotas < 3 && JSON.stringify(a.where).includes('"gte":0,')) {
        rotas++;
        throw new Error("conexión con la base de datos perdida");
      }
      return original(a as never);
    }) as never;
    await correr(ia, () => reunion().status === "error");
    expect(reunion().status).toBe("error");
    expect(reunion().errorMessage).toMatch(/^No pudimos analizar/);
    await reintentarFallidas(ID, new Date(t));
    await correr(ia, () => reunion().status === "lista");
    expect(reunion().status).toBe("lista");
    vi.restoreAllMocks();
  });

  /* ── Volver a pedir el resumen ─────────────────────────────────────────────────────────────────────────── */

  const sinCredenciales = () => new ErrorIA("No pudimos analizar la reunión con IA: el servicio no aceptó las credenciales. Avisa a soporte.", { reintentable: false });
  const IA_CAIDA = () => crearIASimulada({ alLlamar: () => { throw sinCredenciales(); } });
  /** Un respiro: las marcas de tiempo de la base falsa son de milisegundos y «lo nuevo» se separa de lo anterior por ellas. */
  const respiro = () => new Promise((r) => setTimeout(r, 8));
  const ficha = () => reunion().digest as { resumen: string; fragmentosOmitidos?: number; pendientes: string[]; decisiones: unknown[] };

  it("«generar el resumen otra vez» tras una caída total de la IA: rehace todo lo omitido, deja el resumen, suma SOLO el costo nuevo y no manda otro correo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reunionConAudio();
    await correr(IA_CAIDA(), () => reunion().status === "lista");
    expect(reunion().errorMessage).toMatch(/^No pudimos generar el resumen con IA/);
    const bloques = db.meetingTask.filas.filter((x) => x.kind === "analizar_bloque");
    const costoSoloTranscripcion = reunion().costUsd as number;
    expect(costoSoloTranscripcion).toBeGreaterThan(0);
    expect(db.usageRecord.filas.map((x) => x.type)).toEqual(["reunion_audio"]);
    expect(correo).toHaveBeenCalledTimes(1);
    const listaDesde = reunion().readyAt as Date;

    // La IA vuelve y la persona pide el resumen otra vez.
    await respiro();
    const ia = crearIASimulada();
    expect(await reanalizarResumen(ID)).toEqual({ ok: true, fragmentos: bloques.length });
    expect(reunion()).toMatchObject({ status: "procesando", stage: "analizando", errorMessage: null });
    await correr(ia, () => reunion().status === "lista");

    expect(reunion()).toMatchObject({ status: "lista", stage: null, progress: 100, errorMessage: null });
    expect(ficha().resumen).toMatch(/^Resumen simulado/);
    expect(ficha().fragmentosOmitidos).toBeUndefined();
    expect(ia.llamadas).toHaveLength(bloques.length + 1); // un fragmento cada uno y la ficha: nada más
    expect((reunion().readyAt as Date).getTime()).toBeGreaterThan(listaDesde.getTime());

    // El costo: lo que ya estaba más lo nuevo (lo nuevo es todo el análisis, porque la primera vez no se pagó nada de IA).
    const { sumarCostos } = await import("./terminado");
    const c = sumarCostos(db.meetingTask.filas.map((x) => ({ kind: x.kind as string, result: x.result })));
    expect(c.iaUsd).toBeGreaterThan(0);
    expect(reunion().costUsd as number).toBeCloseTo(costoSoloTranscripcion + c.iaUsd, 8);
    // El registro: se agrega el de la IA; el del audio NO se repite. Y no se avisa otra vez por correo.
    expect(db.usageRecord.filas.map((x) => x.type)).toEqual(["reunion_audio", "reunion_ia"]);
    expect(db.usageRecord.filas[1].tokens as number).toBeGreaterThan(0);
    expect(correo).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("si un solo fragmento falló, el resumen sale pero lo dice; al volver a pedirlo se rehace SOLO ese fragmento y la ficha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reunionConAudio();
    const fallaElPrimero = crearIASimulada({ alLlamar: (e) => { if (e.etiqueta === "el fragmento 1") throw sinCredenciales(); } });
    await correr(fallaElPrimero, () => reunion().status === "lista");

    expect(reunion().errorMessage).toBeNull(); // la ficha sí salió
    expect(ficha().resumen).toMatch(/^Resumen simulado/);
    expect(ficha().fragmentosOmitidos).toBe(1);
    expect(ficha().pendientes.some((x) => /No se pudo analizar con IA el fragmento/.test(x))).toBe(true);
    const costoAntes = reunion().costUsd as number;
    const registrosAntes = db.usageRecord.filas.length;

    await respiro();
    const ia = crearIASimulada();
    const hechosAntes = db.meetingTask.filas.filter((x) => x.kind === "analizar_bloque" && !(x.result as { omitido?: string }).omitido).map((x) => String(x.key));
    expect(await reanalizarResumen(ID)).toEqual({ ok: true, fragmentos: 1 });
    await correr(ia, () => reunion().status === "lista");

    expect(ia.llamadas).toHaveLength(2); // el fragmento que faltaba y la ficha: los demás no se vuelven a pagar
    expect(ia.llamadas[0].etiqueta).toBe("el fragmento 1");
    expect(ficha().fragmentosOmitidos).toBeUndefined();
    expect(ficha().pendientes.some((x) => /No se pudo analizar con IA el fragmento/.test(x))).toBe(false);
    expect(db.meetingTask.filas.filter((x) => x.kind === "analizar_bloque").every((x) => !(x.result as { omitido?: string }).omitido)).toBe(true);
    for (const k of hechosAntes) expect(tarea(k)).toMatchObject({ status: "hecha" });

    // Solo se suma lo de esas dos llamadas (el fragmento rehecho y la ficha), calculado aparte de lo que suma el código:
    // los fragmentos que ya estaban hechos se pagaron la primera vez y no se cuentan de nuevo.
    const usoDe = (key: string) => (tarea(key)!.result as { uso: { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number; costoUsd: number } }).uso;
    const esperado = [usoDe("bloque:0"), usoDe("ficha")];
    const costoEsperado = esperado.reduce((suma, u) => suma + u.costoUsd, 0);
    const tokensEsperados = esperado.reduce((suma, u) => suma + u.entrada + u.salida + u.cacheLectura + u.cacheEscritura, 0);
    expect(costoEsperado).toBeGreaterThan(0);

    const nuevas = db.usageRecord.filas.slice(registrosAntes);
    expect(nuevas.map((x) => x.type)).toEqual(["reunion_ia"]);
    expect((reunion().costUsd as number) - costoAntes).toBeCloseTo(costoEsperado, 8);
    expect(nuevas[0].costUsd as number).toBeCloseTo(costoEsperado, 8);
    expect(nuevas[0].tokens).toBe(Math.round(tokensEsperados));
    expect(correo).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("si la IA sigue caída, la reunión vuelve a quedar lista sin resumen (sin cobrar nada) y se puede intentar otra vez", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await reunionConAudio();
    await correr(IA_CAIDA(), () => reunion().status === "lista");
    const costoAntes = reunion().costUsd as number;
    const registrosAntes = db.usageRecord.filas.length;

    await respiro();
    expect(await reanalizarResumen(ID)).toMatchObject({ ok: true });
    await correr(IA_CAIDA(), () => reunion().status === "lista");
    expect(reunion().status).toBe("lista");
    expect(reunion().errorMessage).toMatch(/^No pudimos generar el resumen con IA/);
    expect(reunion().costUsd).toBe(costoAntes);
    expect(db.usageRecord.filas).toHaveLength(registrosAntes);
    expect(correo).toHaveBeenCalledTimes(1);

    // Tercer intento, ya con la IA de vuelta: sale el resumen, y se paga una sola vez.
    await respiro();
    expect(await reanalizarResumen(ID)).toMatchObject({ ok: true });
    await correr(crearIASimulada(), () => reunion().status === "lista");
    expect(ficha().resumen).toMatch(/^Resumen simulado/);
    expect(db.usageRecord.filas.map((x) => x.type)).toEqual(["reunion_audio", "reunion_ia"]);
    vi.restoreAllMocks();
  });

  it("con el resumen completo no se puede volver a pedir: no se llama a la IA ni se cambia nada", async () => {
    const ia = crearIASimulada();
    await reunionConAudio();
    await correr(ia, () => reunion().status === "lista");
    const llamadas = ia.llamadas.length;
    const costo = reunion().costUsd;
    expect(await reanalizarResumen(ID)).toMatchObject({ ok: false, codigo: "no_hace_falta" });
    expect(reunion()).toMatchObject({ status: "lista", costUsd: costo });
    expect(ia.llamadas).toHaveLength(llamadas);
  });
});
