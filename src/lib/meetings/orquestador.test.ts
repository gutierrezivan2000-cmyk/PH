import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import {
  avanzar, contarTareasDeEtapa, fraccionDeFuente, planificarSiguientes, progresoDePreparacion, type FuenteDeProceso,
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
