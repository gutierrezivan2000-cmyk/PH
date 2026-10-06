/**
 * El orquestador del acta: qué se encola y cuándo (puro), cómo empieza, cómo avanza, cómo se retoma y cómo falla.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { planificarSecciones, type SeccionDeActa } from "./acta";
import {
  avanzarActa, avanzarActasEnCurso, cacheCalentada, iniciarActa, planificarSiguientesDeActa, reanudarActa, type TareaDeActa,
} from "./acta-orquestador";
import { FUTURO_LEJANO, fallar, reintentarFallidas } from "./cola";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, construirIntervenciones } from "./demo-datos";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { claveActaCalentar, claveActaFinal, claveActaSeccion } from "./transcripcion/claves";

const ID = "reunionprueba1";
const G = "gen1";
const SECCIONES = planificarSecciones(FICHA_SEPTIEMBRE, DURACION_SEPTIEMBRE_MS);
const N = SECCIONES.length;

let db: DbFalsa;
beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
});

const t = (key: string, status: string, kind = "x"): TareaDeActa => ({ kind, key, status });
const calentar = (status = "hecha") => t(claveActaCalentar(G), status, "acta_calentar");
const seccion = (k: number, status = "hecha") => t(claveActaSeccion(G, k), status, "acta_seccion");
const final = (status = "hecha") => t(claveActaFinal(G), status, "acta_final");
const plan = (tareas: TareaDeActa[], extra: { calentada?: boolean; secciones?: readonly SeccionDeActa[] } = {}) =>
  planificarSiguientesDeActa({ generationId: G, secciones: extra.secciones ?? SECCIONES, tareas, calentada: extra.calentada ?? true });

/* ════════════════════════════════════════════════════════════════════
   El plan (puro)
   ════════════════════════════════════════════════════════════════════ */

describe("planificarSiguientesDeActa", () => {
  it("mientras la caché no esté calentada no se redacta nada", () => {
    expect(plan([])).toEqual({ encolar: [], progreso: 0 });
    expect(plan([calentar("en_curso")])).toEqual({ encolar: [], progreso: 0 });
    expect(plan([calentar("pendiente")]).encolar).toEqual([]);
  });

  it("con la caché calentada se encolan TODAS las secciones a la vez, cada una con lo que necesita", () => {
    const p = plan([calentar()]);
    expect(p.encolar.map((x) => x.key)).toEqual(SECCIONES.map((s) => claveActaSeccion(G, s.k)));
    expect(p.encolar.every((x) => x.kind === "acta_seccion")).toBe(true);
    expect(p.encolar[2].payload).toEqual({ generationId: G, total: N, titulo: SECCIONES[2].titulo, seccion: SECCIONES[2] });
    expect(p.progreso).toBe(5);
  });

  it("es idempotente: lo que ya está encolado no se vuelve a encolar, esté en el estado que esté", () => {
    for (const estado of ["pendiente", "en_curso", "hecha", "fallida"]) {
      const p = plan([calentar(), seccion(0, estado), seccion(1, estado)]);
      expect(p.encolar.map((x) => x.key), estado).toEqual(SECCIONES.slice(2).map((s) => claveActaSeccion(G, s.k)));
    }
  });

  it("si la caché NO se pudo calentar, se redacta una sección sola (la que la escribe) y las demás esperan", () => {
    const solaLaPrimera = plan([calentar()], { calentada: false });
    expect(solaLaPrimera.encolar.map((x) => x.key)).toEqual([claveActaSeccion(G, 0)]);
    // Mientras la primera no termine, las demás siguen esperando.
    expect(plan([calentar(), seccion(0, "en_curso")], { calentada: false }).encolar).toEqual([]);
    // Con la primera hecha, ya la leen todas.
    const resto = plan([calentar(), seccion(0)], { calentada: false });
    expect(resto.encolar.map((x) => x.key)).toEqual(SECCIONES.slice(1).map((s) => claveActaSeccion(G, s.k)));
  });

  it("con todas las secciones hechas se encola el paso final, una sola vez", () => {
    const todas = SECCIONES.map((s) => seccion(s.k));
    const p = plan([calentar(), ...todas]);
    expect(p.encolar).toEqual([{ kind: "acta_final", key: claveActaFinal(G), payload: { generationId: G, total: N } }]);
    expect(plan([calentar(), ...todas, final("pendiente")]).encolar).toEqual([]);
    expect(plan([calentar(), ...todas, final("fallida")]).encolar).toEqual([]);
  });

  it("una sección que falta (o fallida) impide armar el acta", () => {
    const sinUna = SECCIONES.map((s) => seccion(s.k, s.k === 1 ? "fallida" : "hecha"));
    expect(plan([calentar(), ...sinUna]).encolar).toEqual([]);
    const enCurso = SECCIONES.map((s) => seccion(s.k, s.k === 3 ? "en_curso" : "hecha"));
    expect(plan([calentar(), ...enCurso]).encolar).toEqual([]);
  });

  it("el avance: calentar 5 %, las secciones 85 % en partes iguales y armar el acta el 10 % final", () => {
    expect(plan([calentar()]).progreso).toBe(5);
    expect(plan([calentar(), seccion(0)]).progreso).toBe(Math.round(5 + 85 / N));
    const todas = SECCIONES.map((s) => seccion(s.k));
    expect(plan([calentar(), ...todas]).progreso).toBe(90);
    expect(plan([calentar(), ...todas, final()]).progreso).toBe(100);
    // Una sección en curso o fallida no suma.
    expect(plan([calentar(), seccion(0, "en_curso"), seccion(1, "fallida")]).progreso).toBe(5);
  });

  it("sin plan de secciones no hay nada que encolar ni que armar", () => {
    expect(plan([calentar()], { secciones: [] })).toEqual({ encolar: [], progreso: 5 });
  });

  it("cacheCalentada: solo es falsa cuando el calentamiento dice que no se pudo", () => {
    expect(cacheCalentada({ calentada: true })).toBe(true);
    expect(cacheCalentada({ calentada: false, motivo: "x" })).toBe(false);
    for (const raro of [null, undefined, {}, "x", 3, []]) expect(cacheCalentada(raro)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════
   Con la base de datos
   ════════════════════════════════════════════════════════════════════ */

async function sembrarReunion(extra: Record<string, unknown> = {}) {
  await db.meeting.create({
    data: {
      id: ID, userId: "u1", propertyId: "prop1", type: "consejo", title: "Reunión de consejo", date: new Date("2026-09-16T00:00:00Z"),
      status: "lista", durationMs: DURACION_SEPTIEMBRE_MS, digest: structuredClone(FICHA_SEPTIEMBRE), property: { name: "Conjunto Los Pinos" }, ...extra,
    },
  });
  construirIntervenciones().forEach((u, idx) => db.meetingUtterance.filas.push({ id: u.id, meetingId: ID, idx, startMs: u.startMs, endMs: u.endMs, speaker: u.speaker, text: u.text }));
}

const tareasDeActa = (gen: string) => db.meetingTask.filas.filter((x) => String(x.key).startsWith(`acta:${gen}:`));
const estados = (gen: string) => Object.fromEntries(tareasDeActa(gen).map((x) => [String(x.key).replace(`acta:${gen}:`, ""), x.status]));

describe("iniciarActa", () => {
  it("crea la generación del acta y encola SOLO el calentamiento, con el plan de secciones en su payload", async () => {
    await sembrarReunion();
    const r = await iniciarActa({ meetingId: ID, userId: "u1" });
    expect(r).toMatchObject({ ok: true, yaEnCurso: false });
    const generationId = (r as { generationId: string }).generationId;

    expect(db.generation.filas).toHaveLength(1);
    expect(db.generation.filas[0]).toMatchObject({
      id: generationId, userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID, month: 9, year: 2026, inputFiles: [],
      inputText: "Desde la reunión «Reunión de consejo»",
    });
    expect(db.meetingTask.filas).toHaveLength(1);
    expect(db.meetingTask.filas[0]).toMatchObject({ meetingId: ID, kind: "acta_calentar", key: claveActaCalentar(generationId), status: "pendiente" });
    expect((db.meetingTask.filas[0].payload as { secciones: unknown }).secciones).toEqual(planificarSecciones(FICHA_SEPTIEMBRE, DURACION_SEPTIEMBRE_MS));
  });

  it("el mes y el año son los de la reunión en Bogotá, no los de la máquina (una reunión del 30 a las 8 p. m. no es del mes siguiente)", async () => {
    await sembrarReunion({ date: new Date("2026-10-01T01:30:00Z") }); // 30 de septiembre, 8:30 p. m. en Bogotá
    await iniciarActa({ meetingId: ID, userId: "u1" });
    expect(db.generation.filas[0]).toMatchObject({ month: 9, year: 2026 });
  });

  it("sin ficha (la IA no pudo) igual se parte la reunión: en tramos", async () => {
    await sembrarReunion({ digest: null });
    await iniciarActa({ meetingId: ID, userId: "u1" });
    const secciones = (db.meetingTask.filas[0].payload as { secciones: SeccionDeActa[] }).secciones;
    expect(secciones.length).toBeGreaterThan(1);
    expect(secciones[0].titulo).toMatch(/^Parte 1/);
  });

  it("rechaza lo que no se puede: otra persona, una reunión que aún se procesa o una sin transcripción", async () => {
    await sembrarReunion();
    expect(await iniciarActa({ meetingId: ID, userId: "otra" })).toMatchObject({ ok: false, codigo: "no_existe" });
    expect(await iniciarActa({ meetingId: "noexiste", userId: "u1" })).toMatchObject({ ok: false, codigo: "no_existe" });
    await db.meeting.updateMany({ where: { id: ID }, data: { status: "procesando" } });
    expect(await iniciarActa({ meetingId: ID, userId: "u1" })).toMatchObject({ ok: false, codigo: "no_lista" });
    await db.meeting.updateMany({ where: { id: ID }, data: { status: "lista" } });
    db.meetingUtterance.filas.length = 0;
    expect(await iniciarActa({ meetingId: ID, userId: "u1" })).toMatchObject({ ok: false, codigo: "sin_transcripcion" });
    expect(db.generation.filas).toHaveLength(0);
    expect(db.meetingTask.filas).toHaveLength(0);
  });

  it("mira el cupo del plan antes de gastar una generación: si no alcanza, no crea nada", async () => {
    await sembrarReunion();
    const sinCupo = vi.fn(async () => ({ permitido: false, mensaje: "Has alcanzado el límite diario de 3 generaciones." }));
    expect(await iniciarActa({ meetingId: ID, userId: "u1", comprobarCupo: sinCupo })).toEqual({ ok: false, codigo: "sin_cupo", error: "Has alcanzado el límite diario de 3 generaciones." });
    expect(sinCupo).toHaveBeenCalledTimes(1);
    expect(db.generation.filas).toHaveLength(0);
    expect(db.meetingTask.filas).toHaveLength(0);
    // Sin mensaje, dice algo claro.
    const r = await iniciarActa({ meetingId: ID, userId: "u1", comprobarCupo: async () => ({ permitido: false }) });
    expect(r).toMatchObject({ ok: false, codigo: "sin_cupo", error: "Llegaste al límite de generaciones de tu plan." });
  });

  it("con cupo la crea; y pedir otra vez la que ya está en curso no vuelve a mirar (ni a gastar) el cupo", async () => {
    await sembrarReunion();
    const conCupo = vi.fn(async () => ({ permitido: true }));
    const a = await iniciarActa({ meetingId: ID, userId: "u1", comprobarCupo: conCupo });
    expect(a).toMatchObject({ ok: true, yaEnCurso: false });
    const b = await iniciarActa({ meetingId: ID, userId: "u1", comprobarCupo: conCupo });
    expect(b).toMatchObject({ ok: true, yaEnCurso: true });
    expect(conCupo).toHaveBeenCalledTimes(1);
  });

  it("no mira el cupo de lo que no se puede pedir (reunión de otra persona o sin terminar)", async () => {
    await sembrarReunion();
    const cupo = vi.fn(async () => ({ permitido: true }));
    await iniciarActa({ meetingId: ID, userId: "otra", comprobarCupo: cupo });
    await db.meeting.updateMany({ where: { id: ID }, data: { status: "procesando" } });
    await iniciarActa({ meetingId: ID, userId: "u1", comprobarCupo: cupo });
    expect(cupo).not.toHaveBeenCalled();
  });

  it("un doble clic devuelve la misma acta y no crea otra (ni siquiera para borrarla enseguida)", async () => {
    await sembrarReunion();
    const crear = vi.spyOn(db.generation, "create");
    const a = await iniciarActa({ meetingId: ID, userId: "u1" });
    const b = await iniciarActa({ meetingId: ID, userId: "u1" });
    expect(b).toEqual({ ok: true, generationId: (a as { generationId: string }).generationId, yaEnCurso: true });
    expect(crear).toHaveBeenCalledTimes(1);
    expect(db.generation.filas).toHaveLength(1);
    expect(db.meetingTask.filas).toHaveLength(1);
  });

  it("pedirla cuando la anterior se cortó antes de encolar su primer paso la rescata: devuelve la misma y deja su calentamiento encolado", async () => {
    await sembrarReunion();
    await db.generation.create({ data: { id: "cortada", userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID } });
    const r = await iniciarActa({ meetingId: ID, userId: "u1" });
    expect(r).toEqual({ ok: true, generationId: "cortada", yaEnCurso: true });
    expect(db.generation.filas.map((g) => g.id)).toEqual(["cortada"]);
    expect(db.meetingTask.filas.map((x) => [x.kind, x.key, x.status])).toEqual([["acta_calentar", claveActaCalentar("cortada"), "pendiente"]]);
  });

  it("si rescatarla falla, igual devuelve el acta en curso: volver a pedirla no debe romperse por eso", async () => {
    await sembrarReunion();
    await db.generation.create({ data: { id: "cortada", userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID } });
    vi.spyOn(db.meetingTask, "findMany").mockRejectedValueOnce(new Error("base de datos caída"));
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await iniciarActa({ meetingId: ID, userId: "u1" })).toEqual({ ok: true, generationId: "cortada", yaEnCurso: true });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(db.meetingTask.filas).toHaveLength(0);
    aviso.mockRestore();
  });

  it("una acta terminada o con error no impide pedir otra", async () => {
    await sembrarReunion();
    const a = (await iniciarActa({ meetingId: ID, userId: "u1" })) as { generationId: string };
    await db.generation.updateMany({ where: { id: a.generationId }, data: { status: "completed" } });
    const b = (await iniciarActa({ meetingId: ID, userId: "u1" })) as { generationId: string; yaEnCurso: boolean };
    expect(b.yaEnCurso).toBe(false);
    expect(b.generationId).not.toBe(a.generationId);
    await db.generation.updateMany({ where: { id: b.generationId }, data: { status: "failed" } });
    expect(((await iniciarActa({ meetingId: ID, userId: "u1" })) as { yaEnCurso: boolean }).yaEnCurso).toBe(false);
    expect(db.generation.filas).toHaveLength(3);
  });

  it("si dos clics casi a la vez crearon dos actas, queda la más antigua y la otra se borra sin encolar nada", async () => {
    await sembrarReunion();
    // La más antigua ya existe, pero la primera mirada de esta llamada no la vio (el otro clic la creó después de mirar).
    await db.generation.create({ data: { id: "antigua", userId: "u1", propertyId: "prop1", type: "acta", status: "processing", meetingId: ID, createdAt: new Date(Date.now() - 5_000) } });
    vi.spyOn(db.generation, "findMany").mockResolvedValueOnce([]);
    const r = await iniciarActa({ meetingId: ID, userId: "u1" });
    expect(r).toEqual({ ok: true, generationId: "antigua", yaEnCurso: true });
    expect(db.generation.filas.map((g) => g.id)).toEqual(["antigua"]);
    expect(db.meetingTask.filas).toHaveLength(0);
  });
});

describe("avanzarActa", () => {
  async function actaIniciada() {
    await sembrarReunion();
    const r = (await iniciarActa({ meetingId: ID, userId: "u1" })) as { generationId: string };
    return r.generationId;
  }
  const marcar = (gen: string, key: string, data: Record<string, unknown>) => db.meetingTask.updateMany({ where: { meetingId: ID, key: `acta:${gen}:${key}` }, data });

  it("con el calentamiento hecho encola todas las secciones y anota el avance", async () => {
    const gen = await actaIniciada();
    await marcar(gen, "calentar", { status: "hecha", result: { calentada: true } });
    const p = await avanzarActa(ID, gen);
    expect(p?.encolar).toHaveLength(N);
    expect(Object.keys(estados(gen)).sort()).toEqual(["calentar", ...SECCIONES.map((s) => `s${s.k}`)].sort());
    expect(db.generation.filas[0].progress).toBe(5);
    // Llamarla de más no duplica nada.
    await avanzarActa(ID, gen);
    expect(tareasDeActa(gen)).toHaveLength(N + 1);
  });

  it("antes de que termine el calentamiento no encola nada", async () => {
    const gen = await actaIniciada();
    expect((await avanzarActa(ID, gen))?.encolar).toEqual([]);
    expect(tareasDeActa(gen)).toHaveLength(1);
    expect(db.generation.filas[0].progress).toBe(0);
  });

  it("si el calentamiento no dejó la caché, solo se encola la primera sección", async () => {
    const gen = await actaIniciada();
    await marcar(gen, "calentar", { status: "hecha", result: { calentada: false, motivo: "x" } });
    await avanzarActa(ID, gen);
    expect(Object.keys(estados(gen)).sort()).toEqual(["calentar", "s0"]);
    await marcar(gen, "s0", { status: "hecha", result: { k: 0, markdown: "x" } });
    await avanzarActa(ID, gen);
    expect(tareasDeActa(gen)).toHaveLength(N + 1);
  });

  it("con todas las secciones hechas encola el paso final, y el avance nunca retrocede", async () => {
    const gen = await actaIniciada();
    await marcar(gen, "calentar", { status: "hecha", result: { calentada: true } });
    await avanzarActa(ID, gen);
    for (const s of SECCIONES) await marcar(gen, `s${s.k}`, { status: "hecha", result: { k: s.k, markdown: "x" } });
    await avanzarActa(ID, gen);
    expect(estados(gen).final).toBe("pendiente");
    expect(db.generation.filas[0].progress).toBe(90);
    // Un avance calculado con datos más viejos no hace retroceder la barra.
    await db.generation.updateMany({ where: { id: gen }, data: { progress: 95 } });
    await avanzarActa(ID, gen);
    expect(db.generation.filas[0].progress).toBe(95);
  });

  it("una acta que ya no está en curso no avanza (terminada, con error o inexistente)", async () => {
    const gen = await actaIniciada();
    await marcar(gen, "calentar", { status: "hecha", result: { calentada: true } });
    for (const estado of ["completed", "failed"]) {
      await db.generation.updateMany({ where: { id: gen }, data: { status: estado } });
      expect(await avanzarActa(ID, gen)).toBeNull();
    }
    expect(tareasDeActa(gen)).toHaveLength(1);
    expect(await avanzarActa(ID, "noexiste")).toBeNull();
    expect(await avanzarActa("otra", gen)).toBeNull();
  });

  it("si el plan se perdió, el acta falla con un mensaje en vez de quedarse esperando", async () => {
    const gen = await actaIniciada();
    await db.meetingTask.updateMany({ where: { meetingId: ID }, data: { payload: { generationId: gen } } });
    expect(await avanzarActa(ID, gen)).toBeNull();
    expect(db.generation.filas[0]).toMatchObject({ status: "failed", errorMessage: "No pudimos leer el plan del acta. Inténtalo de nuevo." });
  });

  it("si el acta se quedó sin su primer paso (el proceso se cortó entre crearla y encolarlo), se encola de nuevo con el plan de siempre", async () => {
    await sembrarReunion();
    await db.generation.create({ data: { id: G, userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID } });
    const p = await avanzarActa(ID, G);
    expect(p).toMatchObject({ progreso: 0, encolar: [{ kind: "acta_calentar", key: claveActaCalentar(G) }] });
    expect(tareasDeActa(G)).toHaveLength(1);
    expect(db.meetingTask.filas[0]).toMatchObject({ meetingId: ID, kind: "acta_calentar", key: claveActaCalentar(G), status: "pendiente", payload: { generationId: G, secciones: SECCIONES } });
    expect(db.generation.filas[0].status).toBe("processing");
    // Llamarla de nuevo no duplica nada, y con el primer paso hecho el acta sigue su curso normal.
    expect((await avanzarActa(ID, G))?.encolar).toEqual([]);
    expect(tareasDeActa(G)).toHaveLength(1);
    await marcar(G, "calentar", { status: "hecha", result: { calentada: true } });
    expect((await avanzarActa(ID, G))?.encolar).toHaveLength(N);
  });

  it("sin la reunión no hay con qué rehacer el plan: el acta falla con su mensaje en vez de quedarse esperando", async () => {
    await db.generation.create({ data: { id: G, userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID } });
    expect(await avanzarActa(ID, G)).toBeNull();
    expect(db.generation.filas[0]).toMatchObject({ status: "failed", errorMessage: "No pudimos leer el plan del acta. Inténtalo de nuevo." });
    expect(db.meetingTask.filas).toHaveLength(0);
  });

  it("el plan se rehace con la reunión de quien pidió el acta: la de otra persona no cuenta", async () => {
    await sembrarReunion({ userId: "otra-persona" });
    await db.generation.create({ data: { id: G, userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID } });
    expect(await avanzarActa(ID, G)).toBeNull();
    expect(db.generation.filas[0]).toMatchObject({ status: "failed" });
    expect(db.meetingTask.filas).toHaveLength(0);
  });

  it("el cron también rescata un acta que se quedó sin su primer paso", async () => {
    await sembrarReunion();
    await db.generation.create({ data: { id: G, userId: "u1", propertyId: "prop1", type: "acta", status: "processing", progress: 0, meetingId: ID } });
    expect(await avanzarActasEnCurso()).toBe(1);
    expect(estados(G)).toEqual({ calentar: "pendiente" });
  });

  it("avanzarActasEnCurso revisa las actas en curso y deja las demás", async () => {
    const gen = await actaIniciada();
    await marcar(gen, "calentar", { status: "hecha", result: { calentada: true } });
    await db.generation.create({ data: { id: "terminada", userId: "u1", propertyId: "prop1", type: "acta", status: "completed", meetingId: ID } });
    await db.generation.create({ data: { id: "informe", userId: "u1", propertyId: "prop1", type: "informe", status: "processing", meetingId: null } });
    expect(await avanzarActasEnCurso()).toBe(1);
    expect(tareasDeActa(gen)).toHaveLength(N + 1);
  });
});

describe("reanudarActa («Intentar de nuevo»)", () => {
  async function actaConFallo() {
    await sembrarReunion();
    const gen = ((await iniciarActa({ meetingId: ID, userId: "u1" })) as { generationId: string }).generationId;
    await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaCalentar(gen) }, data: { status: "hecha", result: { calentada: true } } });
    await avanzarActa(ID, gen);
    const poner = (k: number, data: Record<string, unknown>) => db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaSeccion(gen, k) }, data });
    await poner(0, { status: "hecha", result: { k: 0, markdown: "Texto." } });
    await poner(1, { status: "fallida", attempts: 3, error: "boom" });
    await poner(2, { status: "pendiente", runAfter: FUTURO_LEJANO });
    await db.generation.updateMany({ where: { id: gen }, data: { status: "failed", errorMessage: "No pudimos redactar la sección…" } });
    return { gen, poner };
  }

  it("lo que falló vuelve a empezar de cero, lo congelado se descongela, lo hecho se conserva y el acta sigue en curso", async () => {
    const { gen } = await actaConFallo();
    const ahora = new Date("2026-10-05T12:00:00Z");
    expect(await reanudarActa(ID, gen, ahora)).toEqual({ ok: true });
    const fila = (k: number) => db.meetingTask.filas.find((x) => x.key === claveActaSeccion(gen, k))!;
    expect(fila(0)).toMatchObject({ status: "hecha", result: { k: 0, markdown: "Texto." } });
    expect(fila(1)).toMatchObject({ status: "pendiente", attempts: 0, error: null, runAfter: ahora });
    expect(fila(2)).toMatchObject({ status: "pendiente", runAfter: ahora });
    expect(db.generation.filas[0]).toMatchObject({ status: "processing", errorMessage: null });
  });

  it("no toca otra acta de la misma reunión ni las tareas del procesamiento", async () => {
    const { gen } = await actaConFallo();
    await db.meetingTask.create({ data: { meetingId: ID, kind: "acta_seccion", key: "acta:otra:s0", status: "fallida", attempts: 3 } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "unir", key: "unir", status: "fallida", attempts: 3 } });
    await reanudarActa(ID, gen);
    expect(db.meetingTask.filas.find((x) => x.key === "acta:otra:s0")).toMatchObject({ status: "fallida", attempts: 3 });
    expect(db.meetingTask.filas.find((x) => x.key === "unir")).toMatchObject({ status: "fallida", attempts: 3 });
  });

  it("al retomarla vuelve a contar para el cupo: si ya no alcanza, no se retoma y todo sigue como estaba", async () => {
    const { gen } = await actaConFallo();
    const sinCupo = async () => ({ permitido: false, mensaje: "Has alcanzado el límite mensual de 15 generaciones." });
    expect(await reanudarActa(ID, gen, new Date(), sinCupo)).toEqual({ ok: false, codigo: "sin_cupo", error: "Has alcanzado el límite mensual de 15 generaciones." });
    expect(db.generation.filas[0]).toMatchObject({ status: "failed", errorMessage: "No pudimos redactar la sección…" });
    expect(db.meetingTask.filas.find((x) => x.key === claveActaSeccion(gen, 1))).toMatchObject({ status: "fallida", attempts: 3 });
    expect(await reanudarActa(ID, gen, new Date(), async () => ({ permitido: true }))).toEqual({ ok: true });
  });

  it("dos clics casi a la vez en «Intentar de nuevo» la retoman una sola vez", async () => {
    const { gen } = await actaConFallo();
    const [a, b] = await Promise.all([reanudarActa(ID, gen), reanudarActa(ID, gen)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it("solo se puede reanudar un acta con error", async () => {
    const { gen } = await actaConFallo();
    for (const estado of ["processing", "completed"]) {
      await db.generation.updateMany({ where: { id: gen }, data: { status: estado } });
      expect(await reanudarActa(ID, gen), estado).toMatchObject({ ok: false, codigo: "no_en_error" });
    }
    expect(db.meetingTask.filas.find((x) => x.key === claveActaSeccion(gen, 1))).toMatchObject({ status: "fallida" });
    expect(await reanudarActa(ID, "noexiste")).toMatchObject({ ok: false, codigo: "no_en_error" });
    expect(await reanudarActa("otra", gen)).toMatchObject({ ok: false, codigo: "no_en_error" });
  });

  it("un acta que quedó en error sin su primer paso (nunca llegó a encolarse) se retoma: se encola y sigue en curso", async () => {
    await sembrarReunion();
    await db.generation.create({
      data: { id: G, userId: "u1", propertyId: "prop1", type: "acta", status: "failed", errorMessage: "La generación excedió el tiempo máximo y se canceló.", meetingId: ID },
    });
    expect(await reanudarActa(ID, G)).toEqual({ ok: true });
    expect(db.generation.filas[0]).toMatchObject({ status: "processing", errorMessage: null });
    expect(estados(G)).toEqual({ calentar: "pendiente" });
  });

  it("si lo que falló fue el último paso y ya no queda nada por rehacer, encola lo que falte", async () => {
    await sembrarReunion();
    const gen = ((await iniciarActa({ meetingId: ID, userId: "u1" })) as { generationId: string }).generationId;
    await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaCalentar(gen) }, data: { status: "hecha", result: { calentada: true } } });
    await avanzarActa(ID, gen);
    for (const s of SECCIONES) await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaSeccion(gen, s.k) }, data: { status: "hecha", result: { k: s.k, markdown: "x" } } });
    // El trabajador murió antes de encolar el paso final y el vigilante dio el acta por muerta.
    await db.generation.updateMany({ where: { id: gen }, data: { status: "failed", errorMessage: "La generación excedió el tiempo máximo y se canceló." } });
    expect(await reanudarActa(ID, gen)).toEqual({ ok: true });
    expect(estados(gen).final).toBe("pendiente");
  });
});

/* ════════════════════════════════════════════════════════════════════
   Cuando algo falla (la cola)
   ════════════════════════════════════════════════════════════════════ */

describe("un fallo de una tarea del acta detiene el acta, no la reunión", () => {
  async function conActaEnCurso() {
    await sembrarReunion();
    const gen = ((await iniciarActa({ meetingId: ID, userId: "u1" })) as { generationId: string }).generationId;
    await db.meetingTask.updateMany({ where: { meetingId: ID, key: claveActaCalentar(gen) }, data: { status: "hecha", result: { calentada: true } } });
    await avanzarActa(ID, gen);
    const fila = (key: string) => db.meetingTask.filas.find((x) => x.key === key)!;
    return { gen, fila };
  }

  it("sin arreglo: el acta queda en error con un mensaje que dice qué sección, lo pendiente se congela y la reunión sigue lista", async () => {
    const { gen, fila } = await conActaEnCurso();
    const id = fila(claveActaSeccion(gen, 1)).id as string;
    await db.meetingTask.updateMany({ where: { id }, data: { status: "en_curso", attempts: 1 } });
    expect(await fallar(id, "El servicio de IA rechazó la solicitud.", { reintentable: false })).toBe("fallida");

    expect(db.generation.filas[0]).toMatchObject({ status: "failed", progress: 0 });
    expect(String(db.generation.filas[0].errorMessage)).toMatch(/^No pudimos redactar la sección «.+» del acta\./);
    expect(fila(claveActaSeccion(gen, 1)).status).toBe("fallida");
    expect(fila(claveActaSeccion(gen, 2))).toMatchObject({ status: "pendiente", runAfter: FUTURO_LEJANO });
    expect(db.meeting.filas[0].status).toBe("lista");
    expect(db.meeting.filas[0].errorMessage ?? null).toBeNull();
  });

  it("con intentos agotados dice cuántos se hicieron y que solo se repite ese paso", async () => {
    const { gen, fila } = await conActaEnCurso();
    const id = fila(claveActaSeccion(gen, 0)).id as string;
    await db.meetingTask.updateMany({ where: { id }, data: { status: "en_curso", attempts: 3 } });
    expect(await fallar(id, "El servicio de IA no respondió.", { reintentable: true })).toBe("fallida");
    expect(String(db.generation.filas[0].errorMessage)).toMatch(/después de 3 intentos\. Reintenta: solo se vuelve a procesar ese paso\.$/);
  });

  it("un fallo del momento se reintenta: el acta sigue en curso", async () => {
    const { gen, fila } = await conActaEnCurso();
    const id = fila(claveActaSeccion(gen, 0)).id as string;
    await db.meetingTask.updateMany({ where: { id }, data: { status: "en_curso", attempts: 1 } });
    expect(await fallar(id, "El servicio de IA está saturado.", { reintentable: true })).toBe("reintento");
    expect(db.generation.filas[0].status).toBe("processing");
    expect(fila(claveActaSeccion(gen, 0))).toMatchObject({ status: "pendiente", error: "El servicio de IA está saturado." });
  });

  it("el fallo de otra acta no detiene a esta", async () => {
    const { gen, fila } = await conActaEnCurso();
    await db.generation.create({ data: { id: "otra", userId: "u1", propertyId: "prop1", type: "acta", status: "processing", meetingId: ID } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "acta_seccion", key: "acta:otra:s0", status: "en_curso", attempts: 3, payload: { titulo: "Otra" } } });
    const idOtra = db.meetingTask.filas.find((x) => x.key === "acta:otra:s0")!.id as string;
    await fallar(idOtra, "x", { reintentable: false });
    expect(db.generation.filas.find((g) => g.id === "otra")).toMatchObject({ status: "failed" });
    expect(db.generation.filas.find((g) => g.id === gen)).toMatchObject({ status: "processing" });
    expect(fila(claveActaSeccion(gen, 2))).toMatchObject({ status: "pendiente", runAfter: expect.not.stringMatching(/2099/) });
    expect((fila(claveActaSeccion(gen, 2)).runAfter as Date).getTime()).toBeLessThan(FUTURO_LEJANO.getTime());
  });

  it("si falla un paso del procesamiento de la reunión, las tareas del acta no se congelan ni se reintentan con la reunión", async () => {
    const { gen, fila } = await conActaEnCurso();
    await db.meeting.updateMany({ where: { id: ID }, data: { status: "procesando" } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "ficha", key: "ficha", status: "en_curso", attempts: 3 } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "analizar_bloque", key: "bloque:9", status: "pendiente" } });
    await fallar(db.meetingTask.filas.find((x) => x.key === "ficha")!.id as string, "boom", { reintentable: false });

    expect(db.meeting.filas[0].status).toBe("error");
    expect(db.meetingTask.filas.find((x) => x.key === "bloque:9")).toMatchObject({ runAfter: FUTURO_LEJANO });
    expect((fila(claveActaSeccion(gen, 2)).runAfter as Date).getTime()).toBeLessThan(FUTURO_LEJANO.getTime());
    expect(db.generation.filas[0].status).toBe("processing");

    // «Reintentar» la reunión no mueve lo de las actas.
    await db.meetingTask.updateMany({ where: { id: fila(claveActaSeccion(gen, 1)).id as string }, data: { status: "fallida", attempts: 3 } });
    await reintentarFallidas(ID);
    expect(fila(claveActaSeccion(gen, 1))).toMatchObject({ status: "fallida", attempts: 3 });
    expect(db.meetingTask.filas.find((x) => x.key === "ficha")).toMatchObject({ status: "pendiente", attempts: 0 });
  });
});
