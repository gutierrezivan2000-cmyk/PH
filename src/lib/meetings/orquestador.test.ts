import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import {
  avanzar, contarTareasDeEtapa, fraccionDeFuente, planificarSiguientes, progresoDePreparacion, type FuenteDeProceso, type TareaDeProceso,
} from "./orquestador";

const f = (id: string, extra: Partial<FuenteDeProceso> = {}): FuenteDeProceso => ({
  id, idx: 0, kind: "archivo", session: null, name: `${id}.m4a`, url: `https://x/${id}`, status: "recibida", normalizedMs: 0, durationMs: null, ...extra,
});

describe("planificarSiguientes", () => {
  it("un archivo recibido se normaliza", () => {
    const p = planificarSiguientes({ fuentes: [f("a")], tareas: [] });
    expect(p.encolar).toEqual([{ kind: "normalizar", key: "normalizar:a", payload: { sourceId: "a", nombre: "a.m4a" } }]);
    expect(p).toMatchObject({ etapa: "preparando_audio", audioListo: false, progreso: 0 });
  });

  it("una sesión de la grabadora sin ensamblar se ensambla primero (y todavía no se normaliza)", () => {
    const p = planificarSiguientes({ fuentes: [f("s1", { kind: "grabacion", session: 2, url: null, name: "Grabación en la app" })], tareas: [] });
    expect(p.encolar).toEqual([{ kind: "ensamblar_sesion", key: "ensamblar_sesion:s1", payload: { sourceId: "s1", session: 2, nombre: "Grabación en la app" } }]);
  });

  it("una sesión ya ensamblada se normaliza como cualquier archivo", () => {
    const p = planificarSiguientes({ fuentes: [f("s1", { kind: "grabacion", session: 1 })], tareas: [{ kind: "ensamblar_sesion", key: "ensamblar_sesion:s1", status: "hecha" }] });
    expect(p.encolar.map((t) => t.key)).toEqual(["normalizar:s1"]);
  });

  it("no repite lo que ya está encolado, sea cual sea su estado (idempotente)", () => {
    for (const status of ["pendiente", "en_curso", "hecha", "fallida"]) {
      const p = planificarSiguientes({ fuentes: [f("a")], tareas: [{ kind: "normalizar", key: "normalizar:a", status }] });
      expect(p.encolar, status).toEqual([]);
    }
  });

  it("encola todas las fuentes a la vez, en el orden de la línea de tiempo", () => {
    const p = planificarSiguientes({ fuentes: [f("b", { idx: 1 }), f("a", { idx: 0 })], tareas: [] });
    expect(p.encolar.map((t) => t.key)).toEqual(["normalizar:a", "normalizar:b"]);
  });

  it("con todas las fuentes normalizadas se arma el audio, una sola vez", () => {
    const fuentes = [f("a", { status: "normalizada" }), f("b", { idx: 1, status: "normalizada" })];
    expect(planificarSiguientes({ fuentes, tareas: [] }).encolar).toEqual([{ kind: "armar_audio", key: "armar_audio", payload: {} }]);
    expect(planificarSiguientes({ fuentes, tareas: [{ kind: "armar_audio", key: "armar_audio", status: "pendiente" }] }).encolar).toEqual([]);
  });

  it("si falta una fuente por normalizar, todavía no se arma el audio", () => {
    const p = planificarSiguientes({ fuentes: [f("a", { status: "normalizada" }), f("b", { idx: 1, status: "normalizando" })], tareas: [{ kind: "normalizar", key: "normalizar:b", status: "en_curso" }] });
    expect(p.encolar).toEqual([]);
  });

  it("con el audio armado pasa a la etapa siguiente", () => {
    const p = planificarSiguientes({ fuentes: [f("a", { status: "normalizada" })], tareas: [{ kind: "armar_audio", key: "armar_audio", status: "hecha" }] });
    expect(p).toMatchObject({ etapa: "transcribiendo", audioListo: true, progreso: 0 });
  });

  it("sin fuentes no hay nada que hacer", () => {
    expect(planificarSiguientes({ fuentes: [], tareas: [] })).toMatchObject({ encolar: [], progreso: 0 });
  });

  it("una fuente en error no frena a las demás ni cuenta para armar el audio", () => {
    const p = planificarSiguientes({ fuentes: [f("a", { status: "error" }), f("b", { idx: 1 })], tareas: [] });
    expect(p.encolar.map((t) => t.key)).toEqual(["normalizar:b"]);
  });
});

describe("planificarSiguientes · transcripción", () => {
  const MIN = 60_000;
  const fuentes = [f("a", { status: "normalizada" })];
  const armado: TareaDeProceso = { kind: "armar_audio", key: "armar_audio", status: "hecha" };
  const tramo = (i: number, status: string): TareaDeProceso => ({ kind: "transcribir_tramo", key: `tramo:${i}`, status });
  const voces = (status: string): TareaDeProceso => ({ kind: "voces", key: "voces", status });
  const unir = (status: string): TareaDeProceso => ({ kind: "unir", key: "unir", status });
  /** 25 min: 3 tramos. */
  const plan = (tareas: TareaDeProceso[], extra: { duracionMs?: number | null } = {}) =>
    planificarSiguientes({ fuentes, tareas: [armado, ...tareas], duracionMs: 25 * MIN, ...extra });

  it("con el audio armado y su duración se encola solo el tramo 0, con todo lo que hace falta para transcribirlo", () => {
    const p = plan([]);
    expect(p.encolar).toEqual([
      { kind: "transcribir_tramo", key: "tramo:0", payload: { i: 0, total: 3, desdeMs: 0, hastaMs: 10 * MIN + 30_000, nucleoDesdeMs: 0, nucleoHastaMs: 10 * MIN } },
    ]);
    expect(p).toMatchObject({ etapa: "transcribiendo", progreso: 0, audioListo: true, lista: false });
  });

  it("sin la duración todavía no se puede planificar: no se encola nada y se espera", () => {
    for (const d of [null, undefined, 0]) {
      expect(plan([], { duracionMs: d })).toMatchObject({ encolar: [], etapa: "transcribiendo", lista: false });
    }
  });

  it("con el tramo 0 hecho se encolan las voces, y los demás tramos todavía no", () => {
    const p = plan([tramo(0, "hecha")]);
    expect(p.encolar.map((t) => t.key)).toEqual(["voces"]);
    expect(p.progreso).toBe(33);
  });

  it("mientras el tramo 0 no esté hecho no se encolan las voces", () => {
    for (const status of ["pendiente", "en_curso", "fallida"]) expect(plan([tramo(0, status)]).encolar, status).toEqual([]);
  });

  it("con las voces hechas se encolan todos los demás tramos de una vez", () => {
    const p = plan([tramo(0, "hecha"), voces("hecha")]);
    expect(p.encolar.map((t) => t.key)).toEqual(["tramo:1", "tramo:2"]);
    expect(p.encolar[1].payload).toMatchObject({ i: 2, total: 3, desdeMs: 20 * MIN - 30_000, hastaMs: 25 * MIN, nucleoDesdeMs: 20 * MIN, nucleoHastaMs: 25 * MIN });
  });

  it("con las voces sin terminar los demás tramos esperan", () => {
    for (const status of ["pendiente", "en_curso", "fallida"]) expect(plan([tramo(0, "hecha"), voces(status)]).encolar, status).toEqual([]);
  });

  it("el avance es la fracción de tramos hechos", () => {
    const base = [tramo(0, "hecha"), voces("hecha")];
    expect(plan([...base, tramo(1, "hecha"), tramo(2, "en_curso")]).progreso).toBe(67);
    expect(plan([...base, tramo(1, "pendiente"), tramo(2, "pendiente")]).progreso).toBe(33);
  });

  it("con todos los tramos hechos se encola unir, una sola vez, y la etapa pasa a «uniendo»", () => {
    const todos = [tramo(0, "hecha"), voces("hecha"), tramo(1, "hecha"), tramo(2, "hecha")];
    const p = plan(todos);
    expect(p.encolar).toEqual([{ kind: "unir", key: "unir", payload: {} }]);
    expect(p).toMatchObject({ etapa: "uniendo", progreso: 0, lista: false });
    expect(plan([...todos, unir("pendiente")]).encolar).toEqual([]);
    expect(plan([...todos, unir("en_curso")])).toMatchObject({ encolar: [], etapa: "uniendo" });
  });

  it("con unir hecho la reunión está lista (hasta que M6 agregue el análisis)", () => {
    const p = plan([tramo(0, "hecha"), voces("hecha"), tramo(1, "hecha"), tramo(2, "hecha"), unir("hecha")]);
    expect(p).toMatchObject({ encolar: [], etapa: null, progreso: 100, lista: true });
  });

  it("no repite nada que ya esté encolado, sea cual sea su estado", () => {
    for (const status of ["pendiente", "en_curso", "hecha", "fallida"]) {
      expect(plan([tramo(0, status)]).encolar.filter((t) => t.key === "tramo:0"), status).toEqual([]);
    }
  });

  it("un tramo fallido frena todo lo que depende de él hasta «Reintentar»", () => {
    const p = plan([tramo(0, "hecha"), voces("hecha"), tramo(1, "hecha"), tramo(2, "fallida")]);
    expect(p).toMatchObject({ encolar: [], etapa: "transcribiendo" });
  });

  it("acepta otro tamaño de tramo y de solape", () => {
    const p = planificarSiguientes({ fuentes, tareas: [armado, tramo(0, "hecha"), voces("hecha")], duracionMs: 150_000, tramoMs: 60_000, solapeMs: 5_000 });
    expect(p.encolar.map((t) => [t.key, t.payload.desdeMs, t.payload.hastaMs])).toEqual([["tramo:1", 55_000, 125_000], ["tramo:2", 115_000, 150_000]]);
  });
});

describe("avance de «Preparando el audio»", () => {
  it("cada fuente vale lo que lleva normalizado de su duración, y todo termina en 100 solo con el audio armado", () => {
    expect(fraccionDeFuente(f("a"))).toBe(0);
    expect(fraccionDeFuente(f("a", { status: "normalizada" }))).toBe(1);
    expect(fraccionDeFuente(f("s", { kind: "grabacion", url: null }))).toBe(0);
    expect(fraccionDeFuente(f("s", { kind: "grabacion" }))).toBeCloseTo(0.1, 6); // ya ensamblada
    expect(fraccionDeFuente(f("a", { status: "normalizando", normalizedMs: 600_000, durationMs: 1_200_000 }))).toBeCloseTo(0.475, 6);
    expect(fraccionDeFuente(f("a", { status: "normalizando", normalizedMs: 2_000_000, durationMs: 1_000_000 }))).toBeLessThan(1); // nunca llega a 1 sin terminar
    expect(progresoDePreparacion([f("a", { status: "normalizada" })], false)).toBe(92);
    expect(progresoDePreparacion([f("a", { status: "normalizada" })], true)).toBe(100);
    expect(progresoDePreparacion([f("a", { status: "normalizada" }), f("b")], false)).toBe(46);
    expect(progresoDePreparacion([], false)).toBe(0);
  });
});

describe("contarTareasDeEtapa", () => {
  it("cuenta hechas y total de las tareas de esa etapa", () => {
    const tareas = [
      { kind: "normalizar", key: "a", status: "hecha" },
      { kind: "normalizar", key: "b", status: "en_curso" },
      { kind: "armar_audio", key: "armar_audio", status: "pendiente" },
      { kind: "transcribir_tramo", key: "t0", status: "hecha" },
    ];
    expect(contarTareasDeEtapa(tareas, "preparando_audio")).toEqual({ hechas: 1, total: 3 });
    expect(contarTareasDeEtapa(tareas, "transcribiendo")).toEqual({ hechas: 1, total: 1 });
    expect(contarTareasDeEtapa(tareas, null)).toEqual({ hechas: 0, total: 0 });
  });

  it("en «transcribiendo» el total son todos los tramos de la reunión, aunque aún no se hayan encolado", () => {
    const tareas = [
      { kind: "transcribir_tramo", key: "tramo:0", status: "hecha" },
      { kind: "voces", key: "voces", status: "en_curso" },
    ];
    expect(contarTareasDeEtapa(tareas, "transcribiendo", 8 * 3_600_000)).toEqual({ hechas: 1, total: 48 });
    // «voces» es un paso interno: no cuenta como un tramo.
    expect(contarTareasDeEtapa(tareas, "transcribiendo")).toEqual({ hechas: 1, total: 1 });
    // Si por alguna razón hay más tareas que tramos previstos, manda lo que hay.
    expect(contarTareasDeEtapa(tareas, "transcribiendo", 5 * 60_000)).toEqual({ hechas: 1, total: 1 });
  });
});

describe("avanzar", () => {
  let db: DbFalsa;
  const ID = "m1";
  beforeEach(() => {
    db = crearDbFalsa();
    fake.db = db;
  });
  const reunion = (extra: Record<string, unknown> = {}) => db.meeting.create({ data: { id: ID, status: "en_cola", stage: null, progress: 0, ...extra } });
  const fuente = (id: string, extra: Record<string, unknown> = {}) =>
    db.meetingSource.create({ data: { id, meetingId: ID, idx: 0, kind: "archivo", session: null, name: `${id}.m4a`, url: `https://x/${id}`, status: "recibida", normalizedMs: 0, durationMs: null, ...extra } });

  it("al cerrar la captura encola la primera etapa y la reunión sigue «en cola» hasta que un trabajador empieza", async () => {
    await reunion();
    await fuente("a");
    await fuente("s1", { idx: 1, kind: "grabacion", session: 1, url: null });
    await avanzar(ID);
    expect(db.meetingTask.filas.map((t) => t.key).sort()).toEqual(["ensamblar_sesion:s1", "normalizar:a"]);
    expect(db.meeting.filas[0]).toMatchObject({ status: "en_cola", stage: null, progress: 0 });
  });

  it("llamarla de más no duplica tareas", async () => {
    await reunion();
    await fuente("a");
    await Promise.all([avanzar(ID), avanzar(ID), avanzar(ID)]);
    expect(db.meetingTask.filas).toHaveLength(1);
  });

  it("al terminar la normalización, encola armar el audio y el avance sube", async () => {
    await reunion({ status: "procesando", stage: "preparando_audio" });
    await fuente("a", { status: "normalizada", normalizedMs: 600_000, durationMs: 600_000 });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "normalizar", key: "normalizar:a", status: "hecha" } });
    await avanzar(ID);
    expect(db.meetingTask.filas.map((t) => t.key).sort()).toEqual(["armar_audio", "normalizar:a"]);
    expect(db.meeting.filas[0].progress).toBe(92);
  });

  it("el avance no retrocede aunque otra tarea lo calcule con datos más viejos", async () => {
    await reunion({ status: "procesando", stage: "preparando_audio", progress: 60 });
    await fuente("a", { status: "normalizando", normalizedMs: 100_000, durationMs: 1_000_000 });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "normalizar", key: "normalizar:a", status: "en_curso" } });
    await avanzar(ID);
    expect(db.meeting.filas[0].progress).toBe(60);
  });

  it("con el audio armado pasa a la etapa siguiente con el avance en 0", async () => {
    await reunion({ status: "procesando", stage: "preparando_audio", progress: 92 });
    await fuente("a", { status: "normalizada" });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "armar_audio", key: "armar_audio", status: "hecha" } });
    await avanzar(ID);
    expect(db.meeting.filas[0]).toMatchObject({ stage: "transcribiendo", progress: 0 });
  });

  describe("la transcripción", () => {
    const tarea = (kind: string, key: string, status: string) => db.meetingTask.create({ data: { meetingId: ID, kind, key, status } });

    it("con el audio listo encola el tramo 0 y el avance de «transcribiendo» sube con los tramos hechos", async () => {
      await reunion({ status: "procesando", stage: "preparando_audio", progress: 92, durationMs: 25 * 60_000 });
      await fuente("a", { status: "normalizada" });
      await tarea("armar_audio", "armar_audio", "hecha");
      await avanzar(ID);
      expect(db.meetingTask.filas.map((t) => t.key).sort()).toEqual(["armar_audio", "tramo:0"]);
      expect(db.meeting.filas[0]).toMatchObject({ stage: "transcribiendo", progress: 0 });

      db.meetingTask.filas.find((t) => t.key === "tramo:0")!.status = "hecha";
      await avanzar(ID);
      expect(db.meetingTask.filas.map((t) => t.key).sort()).toEqual(["armar_audio", "tramo:0", "voces"]);
      expect(db.meeting.filas[0]).toMatchObject({ stage: "transcribiendo", progress: 33 });
    });

    it("cuando unir termina, la reunión queda lista con su hora de término", async () => {
      await reunion({ status: "procesando", stage: "uniendo", progress: 0, durationMs: 25 * 60_000, errorMessage: "viejo" });
      await fuente("a", { status: "normalizada" });
      for (const [kind, key] of [["armar_audio", "armar_audio"], ["transcribir_tramo", "tramo:0"], ["voces", "voces"], ["transcribir_tramo", "tramo:1"], ["transcribir_tramo", "tramo:2"], ["unir", "unir"]]) {
        await tarea(kind, key, "hecha");
      }
      await avanzar(ID);
      expect(db.meeting.filas[0]).toMatchObject({ status: "lista", stage: null, progress: 100, errorMessage: null });
      expect(db.meeting.filas[0].readyAt).toBeInstanceOf(Date);
      expect(await avanzar(ID)).toBeNull(); // ya lista: no se vuelve a tocar
    });

    it("una reunión «en cola» no pasa a lista por aquí (primero un trabajador la toma)", async () => {
      await reunion({ status: "en_cola", durationMs: 25 * 60_000 });
      await fuente("a", { status: "normalizada" });
      for (const [kind, key] of [["armar_audio", "armar_audio"], ["transcribir_tramo", "tramo:0"], ["voces", "voces"], ["transcribir_tramo", "tramo:1"], ["transcribir_tramo", "tramo:2"], ["unir", "unir"]]) {
        await tarea(kind, key, "hecha");
      }
      await avanzar(ID);
      expect(db.meeting.filas[0].status).toBe("en_cola");
    });
  });

  it("no toca una reunión en error, lista, borrador o inexistente", async () => {
    for (const status of ["error", "lista", "borrador", "grabando", "subiendo", "sin_cupo"]) {
      db.meeting.filas.length = 0;
      db.meetingTask.filas.length = 0;
      await reunion({ status });
      await fuente("a");
      expect(await avanzar(ID), status).toBeNull();
      expect(db.meetingTask.filas, status).toEqual([]);
    }
    expect(await avanzar("no-existe")).toBeNull();
  });
});
