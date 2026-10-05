/** «Generar el resumen otra vez»: cuándo se puede y qué rehace (con la base de datos falsa; el orquestador, aparte). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake, avanzar } = vi.hoisted(() => ({ fake: { db: null as unknown }, avanzar: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("./orquestador", () => ({ avanzar: (...a: unknown[]) => avanzar(...a) }));

import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { fragmentoSinAnalizar, reanalizarResumen } from "./reanalisis";

const ID = "m1";
let db: DbFalsa;

const bloqueBueno = (k: number) => ({ k, desdeMs: k * 1_500_000, hastaMs: (k + 1) * 1_500_000, bloque: { temas: [], decisiones: [], compromisos: [], votaciones: [], cifras: [], pistasHablantes: [] }, uso: { entrada: 10, salida: 5, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0.1 } });
const bloqueOmitido = (k: number) => ({ k, desdeMs: k * 1_500_000, hastaMs: (k + 1) * 1_500_000, omitido: "El servicio de IA no respondió.", uso: { entrada: 0, salida: 0, cacheLectura: 0, cacheEscritura: 0, costoUsd: 0 } });

async function sembrar(opciones: { status?: string; errorMessage?: string | null; digest?: unknown; bloques?: Array<"bueno" | "omitido" | "ilegible" | "pendiente"> } = {}) {
  const { status = "lista", errorMessage = "El resumen con IA no se pudo generar.", digest, bloques = ["omitido", "omitido"] } = opciones;
  await db.meeting.create({ data: { id: ID, userId: "u1", title: "Consejo", date: new Date(), status, stage: null, progress: 100, errorMessage, durationMs: 3_000_000, ...(digest !== undefined ? { digest } : {}) } });
  for (const [k, tipo] of bloques.entries()) {
    await db.meetingTask.create({
      data: {
        meetingId: ID, kind: "analizar_bloque", key: `bloque:${k}`, payload: { k, total: bloques.length },
        status: tipo === "pendiente" ? "pendiente" : "hecha", attempts: 3,
        result: tipo === "bueno" ? bloqueBueno(k) : tipo === "omitido" ? bloqueOmitido(k) : tipo === "ilegible" ? { omitida: "x" } : undefined,
      },
    });
  }
  await db.meetingTask.create({ data: { meetingId: ID, kind: "ficha", key: "ficha", status: "hecha", result: { degradada: true } } });
}

const tareas = () => Object.fromEntries(db.meetingTask.filas.map((t) => [t.key as string, t]));

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  avanzar.mockReset();
  avanzar.mockResolvedValue(null);
});

describe("fragmentoSinAnalizar", () => {
  it("un fragmento sin lo extraído (omitido, ilegible o sin resultado) está sin analizar; con lo extraído, no", () => {
    expect(fragmentoSinAnalizar(bloqueBueno(0))).toBe(false);
    expect(fragmentoSinAnalizar(bloqueOmitido(0))).toBe(true);
    expect(fragmentoSinAnalizar({ omitida: "x" })).toBe(true);
    expect(fragmentoSinAnalizar(null)).toBe(true);
    expect(fragmentoSinAnalizar(undefined)).toBe(true);
    expect(fragmentoSinAnalizar("texto")).toBe(true);
    expect(fragmentoSinAnalizar({ k: 0, bloque: "no es un objeto" })).toBe(true);
  });
});

describe("cuándo se puede volver a pedir", () => {
  it("solo con la reunión lista: mientras se procesa (o en error), no", async () => {
    for (const status of ["procesando", "en_cola", "error", "sin_cupo", "borrador"]) {
      db = crearDbFalsa();
      fake.db = db;
      await sembrar({ status });
      expect(await reanalizarResumen(ID), status).toMatchObject({ ok: false, codigo: "no_lista" });
    }
    expect(avanzar).not.toHaveBeenCalled();
  });

  it("una reunión que no existe: no está lista", async () => {
    expect(await reanalizarResumen("no-existe")).toMatchObject({ ok: false, codigo: "no_lista" });
  });

  it("con el resumen completo no hace falta (no se gasta otra vez el análisis de toda la reunión)", async () => {
    await sembrar({ errorMessage: null, digest: { resumen: "Se aprobó el presupuesto.", decisiones: [] }, bloques: ["bueno", "bueno"] });
    expect(await reanalizarResumen(ID)).toEqual({ ok: false, codigo: "no_hace_falta", error: "Esta reunión ya tiene su resumen." });
    expect(db.meeting.filas[0]).toMatchObject({ status: "lista" });
    expect(tareas().ficha).toBeDefined();
    expect(avanzar).not.toHaveBeenCalled();
  });

  it("si la IA leyó la reunión y no encontró qué resumir, tampoco hace falta", async () => {
    await sembrar({ errorMessage: null, digest: { resumen: "", pendientes: ["No se identificaron temas, decisiones ni compromisos en la reunión."] }, bloques: ["bueno"] });
    expect(await reanalizarResumen(ID)).toEqual({ ok: false, codigo: "no_hace_falta", error: "No hay nada que resumir en esta reunión." });
  });

  it("sin fragmentos que analizar (una grabación muy corta) no hay nada que rehacer", async () => {
    await sembrar({ bloques: [] });
    expect(await reanalizarResumen(ID)).toMatchObject({ ok: false, codigo: "sin_bloques" });
    expect(db.meeting.filas[0].status).toBe("lista");
    expect(avanzar).not.toHaveBeenCalled();
  });
});

describe("qué rehace", () => {
  it("tras una caída total de la IA: reinicia los fragmentos omitidos, quita la ficha y deja la reunión analizando", async () => {
    await sembrar({ digest: { resumen: "" }, bloques: ["omitido", "omitido", "omitido"] });
    const r = await reanalizarResumen(ID);
    expect(r).toEqual({ ok: true, fragmentos: 3 });

    for (const k of [0, 1, 2]) expect(tareas()[`bloque:${k}`], `bloque ${k}`).toMatchObject({ status: "pendiente", attempts: 0, lockedAt: null, error: null });
    expect(tareas().ficha).toBeUndefined(); // el orquestador la vuelve a encolar cuando todos los fragmentos estén hechos
    expect(db.meeting.filas[0]).toMatchObject({ status: "procesando", stage: "analizando", progress: 0, errorMessage: null });
    expect(avanzar).toHaveBeenCalledTimes(1);
    expect(avanzar).toHaveBeenCalledWith(ID);
  });

  it("conserva lo ya analizado: solo se rehacen los fragmentos que fallaron", async () => {
    await sembrar({ digest: { resumen: "" }, bloques: ["bueno", "omitido", "bueno", "ilegible"] });
    const antes = JSON.stringify(tareas()["bloque:0"].result);
    const r = await reanalizarResumen(ID);
    expect(r).toEqual({ ok: true, fragmentos: 2 });
    expect(tareas()["bloque:0"]).toMatchObject({ status: "hecha" });
    expect(JSON.stringify(tareas()["bloque:0"].result)).toBe(antes);
    expect(tareas()["bloque:2"]).toMatchObject({ status: "hecha" });
    expect(tareas()["bloque:1"]).toMatchObject({ status: "pendiente", attempts: 0 });
    expect(tareas()["bloque:3"]).toMatchObject({ status: "pendiente", attempts: 0 });
  });

  it("si todos los fragmentos están bien y solo falló la ficha, no rehace ninguno: solo la ficha", async () => {
    await sembrar({ digest: { resumen: "" }, bloques: ["bueno", "bueno"] });
    const r = await reanalizarResumen(ID);
    expect(r).toEqual({ ok: true, fragmentos: 0 });
    expect(tareas()["bloque:0"].status).toBe("hecha");
    expect(tareas()["bloque:1"].status).toBe("hecha");
    expect(tareas().ficha).toBeUndefined();
    expect(db.meeting.filas[0].status).toBe("procesando");
  });

  it("un resumen que quedó con fragmentos sin analizar también se puede completar", async () => {
    await sembrar({ errorMessage: null, digest: { resumen: "Se aprobó el presupuesto.", fragmentosOmitidos: 1 }, bloques: ["bueno", "omitido"] });
    expect(await reanalizarResumen(ID)).toEqual({ ok: true, fragmentos: 1 });
    expect(tareas()["bloque:1"].status).toBe("pendiente");
    expect(tareas()["bloque:0"].status).toBe("hecha");
  });

  it("no toca las tareas que están en marcha ni las de otras reuniones", async () => {
    await sembrar({ digest: { resumen: "" }, bloques: ["omitido", "pendiente"] });
    await db.meetingTask.create({ data: { meetingId: "otra", kind: "analizar_bloque", key: "bloque:0", status: "hecha", result: bloqueOmitido(0) } });
    await db.meetingTask.create({ data: { meetingId: "otra", kind: "ficha", key: "ficha", status: "hecha" } });
    await reanalizarResumen(ID);
    const otras = db.meetingTask.filas.filter((t) => t.meetingId === "otra");
    expect(otras).toHaveLength(2);
    expect(otras.find((t) => t.kind === "analizar_bloque")!.status).toBe("hecha");
  });

  it("dos clics seguidos no la reinician dos veces: el segundo ya la encuentra procesando", async () => {
    await sembrar({ digest: { resumen: "" }, bloques: ["omitido"] });
    expect(await reanalizarResumen(ID)).toMatchObject({ ok: true });
    expect(await reanalizarResumen(ID)).toMatchObject({ ok: false, codigo: "no_lista" });
    expect(avanzar).toHaveBeenCalledTimes(1);
  });

  it("si otro clic ganó la carrera por el estado, esta llamada no vuelve a encolar nada", async () => {
    await sembrar({ digest: { resumen: "" }, bloques: ["omitido"] });
    // Entre leer el estado y cambiarlo, otro proceso ya la puso a procesar.
    const original = db.meeting.updateMany.bind(db.meeting);
    db.meeting.updateMany = (async (a: { where?: { status?: string } }) => {
      await original({ where: { id: ID }, data: { status: "procesando" } });
      return original(a as never);
    }) as never;
    const r = await reanalizarResumen(ID);
    expect(r).toMatchObject({ ok: true });
    expect(avanzar).not.toHaveBeenCalled(); // quien ganó la carrera es quien avanza
  });
});
