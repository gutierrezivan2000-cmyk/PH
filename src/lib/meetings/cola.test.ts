import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import {
  FUTURO_LEJANO, completar, continuar, describirTarea, devolver, encolar, esperaDeReintento, fallar, hayTrabajoSinAtender, latido,
  mensajeDeFallo, reclamar, reintentarFallidas, vigilante,
} from "./cola";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { ESPERAS_REINTENTO_MS, MAX_INTENTOS_TAREA, TAREA_MUERTA_MS } from "./tipos";

let db: DbFalsa;
const ID = "m1";
const T0 = new Date("2026-10-02T12:00:00.000Z");
const mas = (ms: number, base = T0) => new Date(base.getTime() + ms);

const reunion = (extra: Record<string, unknown> = {}) => db.meeting.create({ data: { id: ID, status: "procesando", errorMessage: null, ...extra } });
const tarea = (id: string) => db.meetingTask.filas.find((t) => t.id === id)!;
/** Encola con una antigüedad dada, para que el orden por creación sea el esperado. */
async function poner(key: string, kind = "normalizar", extra: Record<string, unknown> = {}) {
  await db.meetingTask.create({ data: { id: key, meetingId: ID, kind, key, payload: {}, status: "pendiente", attempts: 0, runAfter: T0, lockedAt: null, error: null, ...extra } });
}

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
});

describe("encolar", () => {
  it("crea la tarea y es idempotente por la clave: repetir no duplica ni pisa", async () => {
    expect(await encolar(ID, "normalizar", "normalizar:s1", { nombre: "a.m4a" })).toBe(true);
    expect(await encolar(ID, "normalizar", "normalizar:s1", { nombre: "otra" })).toBe(false);
    expect(db.meetingTask.filas).toHaveLength(1);
    expect(db.meetingTask.filas[0]).toMatchObject({ meetingId: ID, kind: "normalizar", key: "normalizar:s1", payload: { nombre: "a.m4a" } });
  });
  it("la misma clave en otra reunión es otra tarea", async () => {
    await encolar("m1", "armar_audio", "armar_audio");
    await encolar("m2", "armar_audio", "armar_audio");
    expect(db.meetingTask.filas).toHaveLength(2);
  });
  it("respeta runAfter", async () => {
    await encolar(ID, "x", "k", {}, mas(60_000));
    expect(await reclamar(5, undefined, T0)).toEqual([]);
    expect(await reclamar(5, undefined, mas(60_000))).toHaveLength(1);
  });
});

describe("reclamar", () => {
  it("toma las más antiguas primero, hasta el límite, y las deja «en curso» con un intento más", async () => {
    await poner("a");
    await poner("b");
    await poner("c");
    const mias = await reclamar(2, undefined, T0);
    expect(mias.map((t) => t.id)).toEqual(["a", "b"]);
    expect(mias.map((t) => t.attempts)).toEqual([1, 1]);
    expect(tarea("a")).toMatchObject({ status: "en_curso", attempts: 1, lockedAt: T0 });
    expect(tarea("c")).toMatchObject({ status: "pendiente", attempts: 0 });
  });

  it("no toca lo que no está listo: ya en curso, hecha, fallida o programada para después", async () => {
    await poner("curso", "x", { status: "en_curso" });
    await poner("hecha", "x", { status: "hecha" });
    await poner("fallida", "x", { status: "fallida" });
    await poner("luego", "x", { runAfter: mas(1000) });
    expect(await reclamar(10, undefined, T0)).toEqual([]);
  });

  it("filtra por tipo cuando se pide", async () => {
    await poner("a", "normalizar");
    await poner("b", "armar_audio");
    expect((await reclamar(5, ["armar_audio"], T0)).map((t) => t.id)).toEqual(["b"]);
  });

  it("dos trabajadores a la vez nunca se llevan la misma tarea", async () => {
    for (const k of ["a", "b", "c", "d", "e", "f"]) await poner(k);
    const [x, y] = await Promise.all([reclamar(4, undefined, T0), reclamar(4, undefined, T0)]);
    const ids = [...x, ...y].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(6);
    expect(db.meetingTask.filas.every((t) => t.attempts === 1)).toBe(true);
  });

  it("si otro trabajador se adelanta entre la lectura y el reclamo, esa tarea se salta", async () => {
    await poner("a");
    await poner("b");
    const original = db.meetingTask.updateMany.bind(db.meetingTask);
    let primera = true;
    db.meetingTask.updateMany = async (args) => {
      if (primera) {
        primera = false;
        await original({ where: { id: "a" }, data: { status: "en_curso", lockedAt: T0, attempts: 1 } }); // el otro la tomó
      }
      return original(args);
    };
    const mias = await reclamar(1, undefined, T0);
    expect(mias.map((t) => t.id)).toEqual(["b"]);
    expect(tarea("a").attempts).toBe(1); // no se contó dos veces
  });

  it("devuelve la carga útil como objeto", async () => {
    await poner("a", "normalizar", { payload: { sourceId: "s1", nombre: "x.m4a" } });
    expect((await reclamar(1, undefined, T0))[0].payload).toEqual({ sourceId: "s1", nombre: "x.m4a" });
  });
});

describe("completar, continuar y devolver", () => {
  it("completar guarda el resultado y suelta la tarea", async () => {
    await poner("a", "x", { status: "en_curso", lockedAt: T0, error: "viejo" });
    await completar("a", { segmentos: 3 });
    expect(tarea("a")).toMatchObject({ status: "hecha", lockedAt: null, error: null, result: { segmentos: 3 } });
  });

  it("continuar la deja lista para otra pasada ahora mismo y NO cuenta como intento", async () => {
    await poner("a", "x");
    await reclamar(1, undefined, T0);
    expect(tarea("a").attempts).toBe(1);
    await continuar("a", mas(5000));
    expect(tarea("a")).toMatchObject({ status: "pendiente", attempts: 0, lockedAt: null });
    expect(tarea("a").runAfter).toEqual(mas(5000));
    expect(await reclamar(1, undefined, mas(5000))).toHaveLength(1);
  });

  it("devolver la deja quieta (la reunión está en error) sin gastar el intento", async () => {
    await poner("a", "x");
    await reclamar(1, undefined, T0);
    await devolver("a");
    expect(tarea("a")).toMatchObject({ status: "pendiente", attempts: 0, runAfter: FUTURO_LEJANO });
    expect(await reclamar(1, undefined, mas(86_400_000))).toEqual([]);
  });
});

describe("fallar", () => {
  it("un fallo del momento se reintenta con espera creciente: 30 s, 2 min, 10 min", async () => {
    await reunion();
    await poner("a", "normalizar");
    const esperas: number[] = [];
    for (let intento = 1; intento < MAX_INTENTOS_TAREA; intento++) {
      const [t] = await reclamar(1, undefined, mas(esperas.reduce((s, e) => s + e, 0)));
      expect(t.attempts).toBe(intento);
      const ahora = mas(esperas.reduce((s, e) => s + e, 0));
      expect(await fallar("a", "Failed to fetch", { reintentable: true }, ahora)).toBe("reintento");
      esperas.push(ESPERAS_REINTENTO_MS[intento - 1]);
      expect(tarea("a").runAfter).toEqual(mas(ESPERAS_REINTENTO_MS[intento - 1], ahora));
      expect(tarea("a")).toMatchObject({ status: "pendiente", error: "Failed to fetch", lockedAt: null });
    }
    expect(esperas).toEqual([30_000, 120_000]);
    expect(esperaDeReintento(3)).toBe(600_000);
    expect(esperaDeReintento(0)).toBe(30_000);
    expect(esperaDeReintento(99)).toBe(600_000);
  });

  it("al tercer fallo queda «fallida» y la reunión pasa a «error» con un mensaje que dice qué paso fue", async () => {
    await reunion();
    await poner("a", "normalizar", { payload: { nombre: "consejo.m4a" }, attempts: 2 });
    await db.meetingTask.updateMany({ where: { id: "a" }, data: { status: "en_curso", attempts: 3 } });
    expect(await fallar("a", "timeout", { reintentable: true }, T0)).toBe("fallida");
    expect(tarea("a")).toMatchObject({ status: "fallida", error: "timeout" });
    expect(db.meeting.filas[0]).toMatchObject({
      status: "error",
      errorMessage: "No pudimos preparar el audio de «consejo.m4a» después de 3 intentos. Reintenta: solo se vuelve a procesar ese paso.",
    });
  });

  it("un fallo definitivo no se reintenta y muestra la explicación de quien lo detectó", async () => {
    await reunion();
    await poner("a", "normalizar", { payload: { nombre: "roto.m4a" } });
    await reclamar(1, undefined, T0);
    expect(await fallar("a", "No pudimos leer este archivo: parece dañado.", { reintentable: false }, T0)).toBe("fallida");
    expect(db.meeting.filas[0].errorMessage).toBe("No pudimos leer este archivo: parece dañado.");
  });

  it("al fallar para siempre, el resto de las tareas de esa reunión se congela (y las de otras reuniones no)", async () => {
    await reunion();
    await db.meeting.create({ data: { id: "m2", status: "procesando" } });
    await poner("a", "normalizar", { status: "en_curso", attempts: 3 });
    await poner("b", "normalizar");
    await db.meetingTask.create({ data: { id: "otra", meetingId: "m2", kind: "normalizar", key: "k", status: "pendiente", attempts: 0, runAfter: T0 } });
    await fallar("a", "x", { reintentable: false }, T0);
    expect(tarea("b").runAfter).toEqual(FUTURO_LEJANO);
    expect(tarea("otra").runAfter).toEqual(T0);
    expect((await reclamar(10, undefined, mas(3_600_000))).map((t) => t.id)).toEqual(["otra"]);
  });

  it("no pisa una reunión que ya terminó o se eliminó", async () => {
    await reunion({ status: "lista" });
    await poner("a", "normalizar", { attempts: 3, status: "en_curso" });
    await fallar("a", "x", { reintentable: false }, T0);
    expect(db.meeting.filas[0].status).toBe("lista");
    expect(await fallar("no-existe", "x", { reintentable: true })).toBe("inexistente");
  });
});

describe("vigilante", () => {
  it("rescata las tareas que dejaron de avisar: vuelven a «pendiente» con su espera", async () => {
    await reunion();
    await poner("muerta", "normalizar", { status: "en_curso", attempts: 1, lockedAt: mas(-TAREA_MUERTA_MS - 1000) });
    await poner("viva", "normalizar", { status: "en_curso", attempts: 1, lockedAt: mas(-60_000) });
    expect(await vigilante(T0)).toBe(1);
    expect(tarea("muerta")).toMatchObject({ status: "pendiente", error: "La tarea se interrumpió." });
    expect(tarea("muerta").runAfter).toEqual(mas(30_000));
    expect(tarea("viva").status).toBe("en_curso");
    expect(db.meeting.filas[0].status).toBe("procesando");
  });

  it("si ya llevaba 3 intentos queda «fallida» y la reunión pasa a «error»", async () => {
    await reunion();
    await poner("agotada", "normalizar", { status: "en_curso", attempts: 3, lockedAt: mas(-TAREA_MUERTA_MS - 1000), payload: { nombre: "x.mp3" } });
    expect(await vigilante(T0)).toBe(1);
    expect(tarea("agotada").status).toBe("fallida");
    expect(db.meeting.filas[0]).toMatchObject({ status: "error", errorMessage: expect.stringMatching(/preparar el audio de «x\.mp3» después de 3 intentos/) });
  });

  it("el latido mantiene viva a una tarea larga", async () => {
    await reunion();
    await poner("larga", "normalizar", { status: "en_curso", attempts: 1, lockedAt: mas(-TAREA_MUERTA_MS - 1000) });
    await latido("larga", T0);
    expect(await vigilante(T0)).toBe(0);
    expect(tarea("larga").status).toBe("en_curso");
  });

  it("el latido no revive una tarea que ya no está en curso", async () => {
    await poner("a", "x", { status: "hecha" });
    await latido("a", T0);
    expect(tarea("a").lockedAt).toBeNull();
  });
});

describe("reintentarFallidas", () => {
  it("las fallidas empiezan de cero, las congeladas se descongelan y la reunión vuelve a «procesando»", async () => {
    await reunion({ status: "error", errorMessage: "No pudimos…" });
    await poner("f", "normalizar", { status: "fallida", attempts: 3, error: "x" });
    await poner("c", "normalizar", { runAfter: FUTURO_LEJANO });
    await poner("h", "normalizar", { status: "hecha" });
    expect(await reintentarFallidas(ID, T0)).toBe(1);
    expect(tarea("f")).toMatchObject({ status: "pendiente", attempts: 0, error: null });
    expect(tarea("f").runAfter).toEqual(T0);
    expect(tarea("c").runAfter).toEqual(T0);
    expect(tarea("h").status).toBe("hecha");
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando", errorMessage: null });
  });

  it("sin fallidas no cambia nada", async () => {
    await reunion({ status: "procesando" });
    await poner("a", "normalizar");
    expect(await reintentarFallidas(ID, T0)).toBe(0);
    expect(db.meeting.filas[0].status).toBe("procesando");
  });
});

describe("hayTrabajoSinAtender", () => {
  it("sí si hay tareas listas y nadie trabaja", async () => {
    await poner("a");
    expect(await hayTrabajoSinAtender(ID, T0)).toBe(true);
  });
  it("no si no hay nada listo", async () => {
    await poner("a", "x", { runAfter: mas(60_000) });
    expect(await hayTrabajoSinAtender(ID, T0)).toBe(false);
  });
  it("no si alguien trabaja y avisó hace poco; sí si lleva más de 45 s sin avisar", async () => {
    await poner("lista");
    await poner("curso", "x", { status: "en_curso", lockedAt: mas(-10_000) });
    expect(await hayTrabajoSinAtender(ID, T0)).toBe(false);
    await db.meetingTask.updateMany({ where: { id: "curso" }, data: { lockedAt: mas(-46_000) } });
    expect(await hayTrabajoSinAtender(ID, T0)).toBe(true);
  });
  it("sin reunión mira todas", async () => {
    await db.meetingTask.create({ data: { id: "z", meetingId: "otra", kind: "x", key: "z", status: "pendiente", runAfter: T0, attempts: 0 } });
    expect(await hayTrabajoSinAtender(null, T0)).toBe(true);
    expect(await hayTrabajoSinAtender(ID, T0)).toBe(false);
  });
});

describe("mensajes", () => {
  it("dicen qué paso fue", () => {
    expect(describirTarea("ensamblar_sesion", { session: 2 })).toBe("unir las partes de la grabación (sesión 2)");
    expect(describirTarea("normalizar", { nombre: "consejo.m4a" })).toBe("preparar el audio de «consejo.m4a»");
    expect(describirTarea("normalizar", {})).toBe("preparar el audio");
    expect(describirTarea("armar_audio", null)).toBe("unir el audio de la reunión");
    expect(describirTarea("otro", {})).toBe("procesar un paso de la reunión");
  });
  it("agotados los intentos, nombran el paso; un motivo ya legible se usa tal cual", () => {
    expect(mensajeDeFallo("armar_audio", {}, "x", true)).toBe("No pudimos unir el audio de la reunión después de 3 intentos. Reintenta: solo se vuelve a procesar ese paso.");
    expect(mensajeDeFallo("normalizar", { nombre: "a.mp3" }, "No pudimos leer este archivo.", false)).toBe("No pudimos leer este archivo.");
    expect(mensajeDeFallo("normalizar", { nombre: "a.mp3" }, "connection reset", false)).toBe("No pudimos preparar el audio de «a.mp3». connection reset");
  });
});
