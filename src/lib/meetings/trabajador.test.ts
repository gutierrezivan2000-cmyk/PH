import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { AlmacenLocal } from "./almacen-local";
import { FUTURO_LEJANO, encolar } from "./cola";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { ErrorTarea, type Manejador } from "./manejadores";
import { trabajar } from "./trabajador";

let db: DbFalsa;
const ID = "m1";
const almacen = new AlmacenLocal("/tmp/no-se-usa");
let t = Date.now() + 60_000;
const reloj = () => t;

const reunion = (extra: Record<string, unknown> = {}) => db.meeting.create({ data: { id: ID, status: "procesando", stage: "preparando_audio", progress: 0, errorMessage: null, ...extra } });
const tarea = (key: string) => db.meetingTask.filas.find((x) => x.key === key)!;
const opciones = (manejadores: Record<string, Manejador>, extra: Record<string, unknown> = {}) => ({
  presupuestoMs: 600_000, margenMinimoMs: 1000, reloj, manejadores, deps: { almacen }, ...extra,
});

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  t = Date.now() + 60_000; // un poco por delante: las tareas se encolan con la hora real
});

describe("trabajar", () => {
  it("ejecuta lo que hay en la cola, marca cada tarea como hecha con su resultado y llama a avanzar", async () => {
    await reunion();
    await db.meetingSource.create({ data: { id: "a", meetingId: ID, idx: 0, kind: "archivo", name: "a.m4a", url: "https://x/a", status: "recibida", normalizedMs: 0 } });
    await encolar(ID, "normalizar", "normalizar:a", { sourceId: "a" });
    const normalizar: Manejador = async ({ tarea: ta }) => {
      await db.meetingSource.update({ where: { id: "a" }, data: { status: "normalizada" } });
      return { resultado: { hecho: ta.key } };
    };
    const armar: Manejador = vi.fn(async () => ({ resultado: { listo: true } }));
    const r = await trabajar(opciones({ normalizar, armar_audio: armar }));
    expect(r).toEqual({ ejecutadas: 2, fallidas: 0, continuadas: 0 });
    expect(tarea("normalizar:a")).toMatchObject({ status: "hecha", result: { hecho: "normalizar:a" } });
    // avanzar vio la fuente normalizada, encoló armar_audio y el mismo trabajador lo ejecutó.
    expect(tarea("armar_audio")).toMatchObject({ status: "hecha", result: { listo: true } });
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando", stage: "transcribiendo" });
  });

  it("una reunión «en cola» pasa a «procesando» cuando empieza la primera tarea", async () => {
    await reunion({ status: "en_cola", stage: null });
    await encolar(ID, "x", "k");
    await trabajar(opciones({ x: async () => {} }));
    expect(db.meeting.filas[0].status).toBe("procesando");
  });

  it("no pasa del límite de tareas a la vez", async () => {
    await reunion();
    for (let i = 0; i < 9; i++) await encolar(ID, "x", `k${i}`);
    let a = 0;
    let maximo = 0;
    const x: Manejador = async () => {
      a++;
      maximo = Math.max(maximo, a);
      await new Promise((r) => setTimeout(r, 5));
      a--;
    };
    const r = await trabajar(opciones({ x }, { concurrencia: 3 }));
    expect(r.ejecutadas).toBe(9);
    expect(maximo).toBe(3);
  });

  it("un fallo del momento deja la tarea para después (con espera); un fallo definitivo pone la reunión en error", async () => {
    await reunion();
    await encolar(ID, "pasajera", "p");
    await encolar(ID, "definitiva", "d", { nombre: "roto.m4a" });
    const r = await trabajar(opciones({
      pasajera: async () => {
        throw new Error("connection reset");
      },
      definitiva: async () => {
        throw new ErrorTarea("No pudimos leer este archivo: parece dañado.", { reintentable: false });
      },
    }));
    expect(r.fallidas).toBe(2);
    expect(tarea("d")).toMatchObject({ status: "fallida", error: "No pudimos leer este archivo: parece dañado." });
    expect(db.meeting.filas[0]).toMatchObject({ status: "error", errorMessage: "No pudimos leer este archivo: parece dañado." });
    // la otra quedó congelada junto con la reunión: se retoma con «Reintentar»
    expect(tarea("p").runAfter).toEqual(FUTURO_LEJANO);
  });

  it("un fallo pasajero sin más fallos se reintenta tras su espera y entonces funciona", async () => {
    await reunion();
    await encolar(ID, "x", "k");
    let veces = 0;
    const x: Manejador = async () => {
      if (++veces === 1) throw new Error("503");
      return { resultado: { veces } };
    };
    await trabajar(opciones({ x }));
    expect(tarea("k")).toMatchObject({ status: "pendiente", attempts: 1, error: "503" });
    t += 31_000;
    await trabajar(opciones({ x }));
    expect(tarea("k")).toMatchObject({ status: "hecha", result: { veces: 2 } });
  });

  it("«continuar»: la tarea hizo una parte, vuelve a la cola sin gastar intento y el mismo trabajador la retoma", async () => {
    await reunion();
    await encolar(ID, "larga", "k");
    let pasadas = 0;
    const larga: Manejador = async () => (++pasadas < 3 ? { continuar: true } : { resultado: { pasadas } });
    const r = await trabajar(opciones({ larga }));
    expect(r).toMatchObject({ ejecutadas: 3, continuadas: 2, fallidas: 0 });
    expect(tarea("k")).toMatchObject({ status: "hecha", attempts: 1, result: { pasadas: 3 } });
  });

  it("no reclama tareas nuevas cuando queda menos tiempo que el margen", async () => {
    await reunion();
    await encolar(ID, "x", "k");
    const x = vi.fn(async () => {});
    const r = await trabajar(opciones({ x }, { presupuestoMs: 100_000, margenMinimoMs: 120_000 }));
    expect(r.ejecutadas).toBe(0);
    expect(x).not.toHaveBeenCalled();
    expect(tarea("k").status).toBe("pendiente");
  });

  it("a cada tarea le da el tiempo que queda (sin pasar del tope de una tarea) y una señal", async () => {
    await reunion();
    await encolar(ID, "x", "k");
    let visto: { presupuestoMs: number; senal: AbortSignal } | null = null;
    await trabajar(opciones({ x: async (c) => void (visto = { presupuestoMs: c.presupuestoMs, senal: c.senal }) }, { presupuestoMs: 3_000_000 }));
    expect(visto!.presupuestoMs).toBe(230_000);
    expect(visto!.senal.aborted).toBe(false);
  });

  it("deja en paz los tipos de tarea que no conoce (una versión más nueva los atenderá)", async () => {
    await reunion();
    await encolar(ID, "del_futuro", "k");
    const r = await trabajar(opciones({ x: async () => {} }));
    expect(r.ejecutadas).toBe(0);
    expect(tarea("k")).toMatchObject({ status: "pendiente", attempts: 0 });
  });

  it("una reunión en error no avanza: sus tareas se devuelven quietas, sin gastar intentos", async () => {
    await reunion({ status: "error" });
    await encolar(ID, "x", "k");
    const x = vi.fn(async () => {});
    await trabajar(opciones({ x }));
    expect(x).not.toHaveBeenCalled();
    expect(tarea("k")).toMatchObject({ status: "pendiente", attempts: 0, runAfter: FUTURO_LEJANO });
  });

  it("una reunión eliminada no hace fallar nada", async () => {
    await db.meeting.create({ data: { id: "otra", status: "procesando" } });
    await db.meetingTask.create({ data: { meetingId: ID, kind: "x", key: "k" } });
    const x = vi.fn(async () => {});
    const r = await trabajar(opciones({ x }));
    expect(x).not.toHaveBeenCalled();
    expect(r.fallidas).toBe(0);
    expect(tarea("k").status).toBe("hecha");
  });

  it("si avanzar falla, la tarea que terminó bien sigue siendo «hecha»", async () => {
    await reunion();
    await encolar(ID, "x", "k");
    const original = db.meetingSource.findMany.bind(db.meetingSource);
    db.meetingSource.findMany = async () => {
      throw new Error("se cayó la base");
    };
    const registrar = vi.spyOn(console, "error").mockImplementation(() => {});
    await trabajar(opciones({ x: async () => ({ resultado: { ok: true } }) }));
    registrar.mockRestore();
    db.meetingSource.findMany = original;
    expect(tarea("k")).toMatchObject({ status: "hecha", result: { ok: true } });
  });

  it("con la cola vacía termina enseguida", async () => {
    expect(await trabajar(opciones({ x: async () => {} }))).toEqual({ ejecutadas: 0, fallidas: 0, continuadas: 0 });
  });

  it("dos trabajadores a la vez no ejecutan la misma tarea dos veces", async () => {
    await reunion();
    for (let i = 0; i < 6; i++) await encolar(ID, "x", `k${i}`);
    const ejecutadas: string[] = [];
    const x: Manejador = async ({ tarea: ta }) => {
      ejecutadas.push(ta.key);
      await new Promise((r) => setTimeout(r, 3));
    };
    await Promise.all([trabajar(opciones({ x }, { concurrencia: 2 })), trabajar(opciones({ x }, { concurrencia: 2 }))]);
    expect(ejecutadas.sort()).toEqual(["k0", "k1", "k2", "k3", "k4", "k5"]);
  });
});
