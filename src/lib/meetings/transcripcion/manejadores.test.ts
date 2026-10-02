/**
 * Las tareas de transcripción de punta a punta, sin red: una reunión inventada de casi 50 min, su audio falso en una
 * carpeta, un simulador de OpenAI que solo ve los bytes que recibe, la base de datos falsa y el trabajador de verdad.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { leerTodo } from "../almacen";
import { AlmacenLocal } from "../almacen-local";
import { reintentarFallidas } from "../cola";
import { crearDbFalsa, type DbFalsa } from "../db-falsa";
import { MANEJADORES, type Manejador } from "../manejadores";
import { avanzar } from "../orquestador";
import { trabajar } from "../trabajador";
import { crearIASimulada } from "../ia-simulada";
import { sumarCostos } from "../terminado";
import { crearProveedorOpenAI } from "./openai";
import {
  audioSintetico, crearProveedorSintetico, crearSimuladorDeOpenAI, generarGuion, personaDeAudio, type Intervencion,
} from "./sintetico";
import { ErrorTranscripcion, type ProveedorDeTranscripcion } from "./tipos";
import { planificarTramos } from "./tramos";

const S = 1000;
const PERSONAS = ["Martha", "Jorge", "Carolina", "Hernán", "Andrés"];
const PESOS = [4, 3, 3, 3, 0.15];
const DURACION = 2_999_952; // casi 50 min: 5 tramos
const ID = "reunionprueba1";
const PREFIJO = `meetings/${ID}/`;

let carpeta: string;
let almacen: AlmacenLocal;
let db: DbFalsa;
let guion: Intervencion[];
let audio: Uint8Array;
let t: number;

beforeAll(() => {
  carpeta = mkdtempSync(join(tmpdir(), "reunion-transcripcion-"));
  guion = generarGuion({ duracionMs: DURACION, personas: PERSONAS, pesos: PESOS, semilla: 11, silencios: [[1_500 * S, 1_700 * S]] });
  audio = audioSintetico(guion, PERSONAS, DURACION);
});
afterAll(() => rmSync(carpeta, { recursive: true, force: true }));

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  almacen = new AlmacenLocal(join(carpeta, `a-${Math.random().toString(36).slice(2, 8)}`));
  t = Date.now() + 60_000; // un poco por delante de la hora real, con la que se encolan las tareas
});

/** Una reunión con el audio ya armado: lo único que falta es transcribir. */
async function reunionConAudio(extra: Record<string, unknown> = {}) {
  const subido = await almacen.subir(`${PREFIJO}audio.mp3`, audio, "audio/mpeg");
  await db.meeting.create({
    data: { id: ID, status: "procesando", stage: "preparando_audio", progress: 0, errorMessage: null, durationMs: DURACION, audioUrl: subido.url, speakerRefs: null, ...extra },
  });
  await db.meetingSource.create({
    data: { id: "s1", meetingId: ID, idx: 0, kind: "archivo", name: "consejo.m4a", url: "https://x/s1", status: "normalizada", normalizedMs: DURACION, durationMs: DURACION, offsetMs: 0 },
  });
  await db.meetingTask.create({ data: { meetingId: ID, kind: "armar_audio", key: "armar_audio", status: "hecha" } });
  await avanzar(ID);
}

const meeting = () => db.meeting.filas[0];
const tarea = (key: string) => db.meetingTask.filas.find((x) => x.key === key);
const llaves = () => db.meetingTask.filas.map((x) => String(x.key)).sort();

/** Pasadas del trabajador hasta que se cumple la condición; entre pasada y pasada el reloj salta lo que dura una espera de reintento. */
async function correr(hasta: () => boolean, deps: { proveedor?: ProveedorDeTranscripcion } = {}, manejadores: Record<string, Manejador> = MANEJADORES, maximo = 40) {
  const ia = crearIASimulada(); // el análisis con IA tiene sus pruebas aparte: aquí solo se necesita que no estorbe
  for (let pasada = 0; pasada < maximo && !hasta(); pasada++) {
    await trabajar({ presupuestoMs: 600_000, margenMinimoMs: 1000, reloj: () => t, manejadores, deps: { almacen, ia, ...deps } });
    t += 12 * 60_000;
  }
}

describe("el recorrido completo", () => {
  it("de audio.mp3 a una reunión lista: tramo 0, voces, los demás tramos, unir", async () => {
    const sim = crearSimuladorDeOpenAI(guion, PERSONAS);
    const proveedor = crearProveedorOpenAI({ crear: sim.crear });
    await reunionConAudio();
    expect(llaves()).toEqual(["armar_audio", "tramo:0"]); // los demás tramos esperan a las voces

    await correr(() => meeting().status === "lista", { proveedor });

    expect(llaves().filter((k) => !k.startsWith("bloque:"))).toEqual(["armar_audio", "ficha", "tramo:0", "tramo:1", "tramo:2", "tramo:3", "tramo:4", "unir", "voces"]);
    expect(llaves().filter((k) => k.startsWith("bloque:")).length).toBeGreaterThanOrEqual(2); // 50 min: bloques de ~25 min
    expect(db.meetingTask.filas.every((x) => x.status === "hecha")).toBe(true);
    expect(meeting()).toMatchObject({ status: "lista", stage: null, progress: 100, coverage: 1, provider: "openai" });
    expect(meeting().readyAt).toBeInstanceOf(Date);
    expect(meeting().errorMessage).toBeNull();

    // Las intervenciones son exactamente el guion: mismo texto, mismo minuto, en orden.
    const u = [...db.meetingUtterance.filas].sort((a, b) => (a.idx as number) - (b.idx as number));
    expect(u.map((x) => x.text)).toEqual(guion.map((g) => g.texto));
    expect(u.map((x) => [x.startMs, x.endMs])).toEqual(guion.map((g) => [g.inicioMs, g.finMs]));
    expect(u.every((x, k) => x.idx === k && x.meetingId === ID)).toBe(true);

    // El simulador solo ve bytes: el tramo 0 va sin voces conocidas y los demás con las cuatro, que son de verdad de cuatro personas distintas.
    expect(sim.llamadas.map((l) => l.referencias.length).sort()).toEqual([0, 4, 4, 4, 4]);
    expect(sim.llamadas.filter((l) => l.referencias.length === 0)).toHaveLength(1);
    const refs = meeting().speakerRefs as Array<{ nombre: string; etiquetaLocal: string; desdeMs: number; hastaMs: number }>;
    expect(refs.map((r) => r.nombre)).toEqual(["V1", "V2", "V3", "V4"]);
    const quien = refs.map((r) => personaDeAudio(audio.slice(Math.floor(r.desdeMs / 36) * 144, Math.ceil(r.hastaMs / 36) * 144), PERSONAS));
    expect(new Set(quien).size).toBe(4);
    expect(quien).not.toContain("Andrés");

    // Cada etiqueta es de una sola persona, en toda la reunión (si la muestra de una voz se cortara mal, el proveedor
    // llamaría V1 a otra persona en los demás tramos y la etiqueta mezclaría a dos).
    const duenos = new Map<string, Set<string>>();
    u.forEach((x, k) => duenos.set(x.speaker as string, (duenos.get(x.speaker as string) ?? new Set()).add(guion[k].quien)));
    for (const [etiqueta, personas] of duenos) expect([etiqueta, [...personas]], etiqueta).toEqual([etiqueta, [expect.any(String)]]);
    const deLasV = ["V1", "V2", "V3", "V4"].map((e) => [...(duenos.get(e) ?? [])][0]);
    expect(new Set(deLasV).size).toBe(4);
  });

  it("deja los hablantes con su habla y su muestra, el texto completo subido y los silencios anotados", async () => {
    const proveedor = crearProveedorOpenAI({ crear: crearSimuladorDeOpenAI(guion, PERSONAS).crear });
    await reunionConAudio();
    await correr(() => meeting().status === "lista", { proveedor });

    const hablantes = db.meetingSpeaker.filas;
    const etiquetas = hablantes.map((h) => h.label as string).sort();
    expect(etiquetas.filter((e) => e.startsWith("V"))).toEqual(["V1", "V2", "V3", "V4"]);
    const otras = etiquetas.filter((e) => !e.startsWith("V"));
    expect(otras.length).toBeGreaterThan(0); // Andrés habla poco y no tiene muestra
    expect(otras.every((e) => /^H\d+$/.test(e))).toBe(true);
    expect(hablantes.every((h) => h.confirmed === false && h.name === null && h.role === null)).toBe(true);
    const habla = guion.reduce((s, g) => s + (g.finMs - g.inicioMs), 0);
    expect(hablantes.reduce((s, h) => s + (h.talkMs as number), 0)).toBe(habla);
    for (const h of hablantes.filter((x) => (x.talkMs as number) > 20_000)) {
      expect((h.sampleEndMs as number) - (h.sampleStartMs as number)).toBeGreaterThanOrEqual(5_000);
      expect((h.sampleEndMs as number) - (h.sampleStartMs as number)).toBeLessThanOrEqual(8_000);
    }

    const silencios = meeting().silences as Array<{ desdeMs: number; hastaMs: number }>;
    expect(silencios.some((s) => s.desdeMs <= 1_510 * S && s.hastaMs >= 1_690 * S)).toBe(true);

    const texto = new TextDecoder().decode(await leerTodo(almacen, meeting().transcriptUrl as string));
    const lineas = texto.split("\n");
    expect(lineas.filter((l) => !l.includes("(Sin voz hasta"))).toHaveLength(guion.length);
    expect(lineas[0]).toMatch(/^\[00:00:0\d\] V\d: Frase 1 de /);
    expect(lineas.some((l) => /^\[00:2\d:\d\d\] \(Sin voz hasta 00:2\d:\d\d\)$/.test(l))).toBe(true);
    expect(almacen.tipos.get(`${PREFIJO}transcripcion.txt`)).toBe("text/plain; charset=utf-8");
  });

  it("registra el costo de lo que se transcribió, solapes incluidos", async () => {
    const proveedor = crearProveedorOpenAI({ crear: crearSimuladorDeOpenAI(guion, PERSONAS).crear });
    await reunionConAudio();
    await correr(() => meeting().status === "lista", { proveedor });
    const minutos = planificarTramos(DURACION).reduce((s, x) => s + (x.hastaMs - x.desdeMs) / 60_000, 0);
    const costos = sumarCostos(db.meetingTask.filas.map((x) => ({ kind: x.kind as string, result: x.result })));
    expect(costos.transcripcionUsd).toBeCloseTo(minutos * 0.006, 3);
    expect(meeting().costUsd as number).toBeCloseTo(costos.transcripcionUsd + costos.iaUsd, 6);
    expect(minutos).toBeGreaterThan(DURACION / 60_000); // los solapes se pagan
  });

  it("el avance cuenta tramos hechos de los totales y los demás tramos esperan a las voces", async () => {
    const proveedor = crearProveedorSintetico({ guion, personas: PERSONAS });
    await reunionConAudio();
    // Solo se transcribe el tramo 0: queda esperando a las voces.
    await correr(() => tarea("tramo:0")?.status === "hecha", { proveedor }, { transcribir_tramo: MANEJADORES.transcribir_tramo }, 1);
    expect(tarea("voces")?.status).toBe("pendiente");
    expect(tarea("tramo:1")).toBeUndefined();
    expect(meeting()).toMatchObject({ stage: "transcribiendo", progress: 20 });
    // Con las voces hechas se encolan los otros cuatro.
    await correr(() => tarea("voces")?.status === "hecha", { proveedor }, { voces: MANEJADORES.voces }, 1);
    expect(llaves()).toEqual(["armar_audio", "tramo:0", "tramo:1", "tramo:2", "tramo:3", "tramo:4", "voces"]);
    await correr(() => tarea("tramo:4")?.status === "hecha", { proveedor }, { transcribir_tramo: MANEJADORES.transcribir_tramo }, 1);
    expect(meeting()).toMatchObject({ stage: "uniendo", progress: 0 });
    expect(tarea("unir")?.status).toBe("pendiente");
  });
});

describe("cuando algo falla", () => {
  /** Un proveedor que falla en el tramo que empieza en `desdeMs` mientras `fallar.activo`. */
  function conFallo(desdeMs: number, error: () => Error) {
    const estado = { activo: true, intentos: 0 };
    const base = crearProveedorSintetico({
      guion, personas: PERSONAS,
      alLlamar: (l) => {
        if (l.desdeMs === desdeMs && estado.activo) {
          estado.intentos++;
          throw error();
        }
      },
    });
    return { proveedor: base, estado };
  }
  const TRAMO_2 = 1_200_000 - 30_000; // el audio del tramo 2 arranca 30 s antes de su núcleo (alineado a la trama de 36 ms)
  const alineado = Math.floor(TRAMO_2 / 36) * 36;

  it("un fallo del momento se reintenta con espera; a la tercera la reunión queda en error diciendo qué tramo fue, y «Reintentar» la termina", async () => {
    const { proveedor, estado } = conFallo(alineado, () => new ErrorTranscripcion("El servicio de transcripción no respondió.", { reintentable: true }));
    await reunionConAudio();
    await correr(() => meeting().status === "error", { proveedor });
    expect(estado.intentos).toBe(3);
    expect(tarea("tramo:2")).toMatchObject({ status: "fallida", attempts: 3 });
    expect(meeting().status).toBe("error");
    expect(meeting().errorMessage).toBe("No pudimos transcribir el tramo 0:20:00–0:30:00 después de 3 intentos. Reintenta: solo se vuelve a procesar ese paso.");
    // Los demás tramos sí se hicieron: «Reintentar» no los repite.
    const hechos = ["tramo:0", "tramo:1", "tramo:3", "tramo:4"].map((k) => tarea(k)?.status);
    expect(hechos).toEqual(["hecha", "hecha", "hecha", "hecha"]);
    expect(tarea("unir")).toBeUndefined();

    estado.activo = false;
    const llamadasAntes = proveedor.llamadas.length;
    await reintentarFallidas(ID, new Date(t));
    await correr(() => meeting().status === "lista", { proveedor });
    expect(proveedor.llamadas.length - llamadasAntes).toBe(1); // solo el tramo que había fallado
    expect(db.meetingUtterance.filas.map((u) => u.text)).toEqual(guion.map((g) => g.texto));
  });

  it("un fallo que reintentar no arregla (clave, cuenta, audio rechazado) deja la reunión en error de inmediato, con el motivo", async () => {
    const proveedor = crearProveedorOpenAI({
      crear: async () => {
        throw Object.assign(new Error("Incorrect API key"), { status: 401 });
      },
    });
    await reunionConAudio();
    await correr(() => meeting().status === "error", { proveedor });
    expect(tarea("tramo:0")).toMatchObject({ status: "fallida", attempts: 1 });
    expect(meeting().errorMessage).toBe("No pudimos transcribir: el servicio de transcripción no aceptó las credenciales. Avisa a soporte.");

    const rechazo = crearProveedorOpenAI({
      crear: async () => {
        throw Object.assign(new Error("Audio file is too short"), { status: 400 });
      },
    });
    await reintentarFallidas(ID, new Date(t));
    await correr(() => meeting().status === "error" && tarea("tramo:0")?.status === "fallida", { proveedor: rechazo });
    expect(meeting().errorMessage).toMatch(/^No pudimos transcribir el tramo 0:00:00–0:10:00\. El servicio de transcripción rechazó este tramo de audio/);
  });

  it("sin audio todavía (o sin duración) la tarea espera en vez de fallar para siempre", async () => {
    await reunionConAudio({ audioUrl: null });
    const r = await trabajar({ presupuestoMs: 600_000, margenMinimoMs: 1000, reloj: () => t, deps: { almacen, proveedor: crearProveedorSintetico({ guion, personas: PERSONAS }) } });
    expect(r.fallidas).toBe(1);
    expect(tarea("tramo:0")).toMatchObject({ status: "pendiente", error: "El audio de la reunión todavía no está listo." });
  });
});

describe("cada tarea por separado", () => {
  const ctx = (payload: Record<string, unknown>, proveedor?: ProveedorDeTranscripcion) => ({
    tarea: { id: "x", meetingId: ID, kind: "x", key: "k", payload, attempts: 1 },
    presupuestoMs: 230_000,
    senal: new AbortController().signal,
    deps: { almacen, ahora: () => new Date(), proveedor },
  });

  it("un tramo de menos de un segundo no se manda al proveedor y queda anotado como omitido", async () => {
    await reunionConAudio();
    const proveedor = crearProveedorSintetico({ guion, personas: PERSONAS });
    const r = await MANEJADORES.transcribir_tramo(ctx({ i: 4, desdeMs: 2_999_000, hastaMs: 2_999_500, nucleoDesdeMs: 2_999_000, nucleoHastaMs: 2_999_500 }, proveedor));
    expect(r).toMatchObject({ resultado: { segmentos: [], costoUsd: 0, omitido: "dura menos de un segundo" } });
    expect(proveedor.llamadas).toHaveLength(0);
  });

  it("una tarea sin tramo o con tiempos que no cuadran es un error definitivo", async () => {
    await reunionConAudio();
    await expect(MANEJADORES.transcribir_tramo(ctx({}))).rejects.toMatchObject({ reintentable: false });
    await expect(MANEJADORES.transcribir_tramo(ctx({ i: 1, desdeMs: 5, hastaMs: 5, nucleoDesdeMs: 5, nucleoHastaMs: 5 }))).rejects.toMatchObject({ reintentable: false });
  });

  it("si la reunión ya no existe, no hace nada", async () => {
    const r = await MANEJADORES.transcribir_tramo(ctx({ i: 0, desdeMs: 0, hastaMs: 1, nucleoDesdeMs: 0, nucleoHastaMs: 1 }));
    expect(r).toEqual({ resultado: { omitida: "la reunión ya no existe" } });
    expect(await MANEJADORES.unir(ctx({}))).toEqual({ resultado: { omitida: "la reunión ya no existe" } });
  });

  it("voces espera a que el tramo 0 esté hecho", async () => {
    await reunionConAudio();
    await expect(MANEJADORES.voces(ctx({}))).rejects.toMatchObject({ reintentable: true });
    await db.meetingTask.updateMany({ where: { key: "tramo:0" }, data: { status: "hecha", result: { basura: true } } });
    await expect(MANEJADORES.voces(ctx({}))).rejects.toMatchObject({ reintentable: false });
  });

  it("voces sin nadie que hable lo suficiente deja la lista vacía (los demás tramos van sin voces conocidas)", async () => {
    await reunionConAudio();
    await db.meetingTask.updateMany({
      where: { key: "tramo:0" },
      data: { status: "hecha", result: { i: 0, desdeMs: 0, hastaMs: 630_000, nucleoDesdeMs: 0, nucleoHastaMs: 600_000, segmentos: [{ inicioMs: 1000, finMs: 6000, hablante: "A", texto: "hola" }], costoUsd: 0, proveedor: "demo" } },
    });
    expect(await MANEJADORES.voces(ctx({}))).toEqual({ resultado: { voces: 0 } });
    expect(meeting().speakerRefs).toEqual([]);
  });

  it("unir no avanza si falta algún tramo (la cobertura no llega a 1)", async () => {
    await reunionConAudio();
    await db.meetingTask.updateMany({
      where: { key: "tramo:0" },
      data: { status: "hecha", result: { i: 0, desdeMs: 0, hastaMs: 630_000, nucleoDesdeMs: 0, nucleoHastaMs: 600_000, segmentos: [], costoUsd: 0, proveedor: "demo" } },
    });
    await expect(MANEJADORES.unir(ctx({}))).rejects.toMatchObject({ reintentable: true, message: expect.stringMatching(/cobertura 20 %/) });
  });

  it("unir es idempotente: repetirlo no duplica intervenciones y conserva los nombres que ya se pusieron a los hablantes", async () => {
    const proveedor = crearProveedorOpenAI({ crear: crearSimuladorDeOpenAI(guion, PERSONAS).crear });
    await reunionConAudio();
    await correr(() => meeting().status === "lista", { proveedor });
    const cantidad = db.meetingUtterance.filas.length;
    const v1 = db.meetingSpeaker.filas.find((h) => h.label === "V1")!;
    await db.meetingSpeaker.update({ where: { id: v1.id }, data: { name: "Martha López", role: "presidente", confirmed: true } });

    await MANEJADORES.unir(ctx({}));
    expect(db.meetingUtterance.filas).toHaveLength(cantidad);
    expect(db.meetingSpeaker.filas.find((h) => h.label === "V1")).toMatchObject({ name: "Martha López", role: "presidente", confirmed: true });
    const texto = new TextDecoder().decode(await leerTodo(almacen, meeting().transcriptUrl as string));
    expect(texto).toMatch(/V1 \(Martha López\): /);
  });

  it("unir inserta las intervenciones en lotes de 1.000", async () => {
    await reunionConAudio();
    // Dos voces que se alternan: ninguna intervención se junta con la vecina.
    const muchas = Array.from({ length: 2_500 }, (_, k) => ({ inicioMs: k * 1000, finMs: k * 1000 + 800, hablante: k % 2 ? "B" : "A", texto: `intervención ${k}` }));
    await db.meetingTask.updateMany({
      where: { key: "tramo:0" },
      data: { status: "hecha", result: { i: 0, desdeMs: 0, hastaMs: DURACION, nucleoDesdeMs: 0, nucleoHastaMs: DURACION, segmentos: muchas, costoUsd: 0.1, proveedor: "demo" } },
    });
    // Un solo tramo que cubre toda la reunión: la cobertura es 1.
    const lotes: number[] = [];
    const original = db.meetingUtterance.createMany.bind(db.meetingUtterance);
    db.meetingUtterance.createMany = async (a: { data: Array<Record<string, unknown>> }) => {
      lotes.push(a.data.length);
      return original(a);
    };
    const r = await MANEJADORES.unir(ctx({}));
    expect(lotes).toEqual([1000, 1000, 500]);
    expect(r).toMatchObject({ resultado: { intervenciones: 2_500, hablantes: 2, cobertura: 1 } });
    expect(db.meetingUtterance.filas).toHaveLength(2_500);
  });
});
