/** Lo que se le cuenta a la interfaz de un acta: el estado, el avance, lo pendiente, los requisitos y dónde abrirla. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({ fake: { db: null as unknown } }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));

import { planificarSecciones } from "./acta";
import { aActaDTO, estadoDeActa, leerActa, leerPendientes, leerRequisitos, urlDeDescarga, type FilaDeActa } from "./acta-estado";
import { AlmacenLocal } from "./almacen-local";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE } from "./demo-datos";
import { claveActaCalentar, claveActaSeccion } from "./transcripcion/claves";

const SECCIONES = planificarSecciones(FICHA_SEPTIEMBRE, DURACION_SEPTIEMBRE_MS);
const CREADA = new Date("2026-10-05T15:00:00Z");
const TERMINADA = new Date("2026-10-05T15:04:00Z");

const fila = (extra: Partial<FilaDeActa> = {}): FilaDeActa => ({
  id: "gen1", status: "processing", progress: 0, createdAt: CREADA, completedAt: null, errorMessage: null, outputFiles: null, ...extra,
});
const SALIDA = {
  actaHtml: "https://blob/acta.html",
  actaMarkdown: "https://blob/acta.md",
  actaReferencias: "https://blob/acta-referencias.md",
  actaPendientes: JSON.stringify(["La decisión D2 no quedó desarrollada.", "No se mencionó el lugar."]),
  actaRequirements: JSON.stringify([{ item: "Tipo de reunion", status: "completo", detail: "Consejo" }, { item: "Quórum", status: "pendiente", detail: "No se dijo" }]),
};

describe("estadoDeActa", () => {
  it("traduce el estado de la generación a lo que ve la persona", () => {
    expect(estadoDeActa("processing")).toBe("procesando");
    expect(estadoDeActa("pending")).toBe("procesando");
    expect(estadoDeActa("completed")).toBe("lista");
    expect(estadoDeActa("failed")).toBe("error");
  });
});

describe("aActaDTO", () => {
  it("mientras se redacta dice qué hace: preparando, redactando (con cuántas secciones) y armando", () => {
    expect(aActaDTO(fila({ progress: 0 }))).toMatchObject({ estado: "procesando", progreso: 0, etapa: "preparando", secciones: null, archivos: null, pendientes: [], error: null });
    expect(aActaDTO(fila({ progress: 5 }), { hechas: 0, total: 5 })).toMatchObject({ etapa: "redactando", secciones: { hechas: 0, total: 5 } });
    expect(aActaDTO(fila({ progress: 42 }), { hechas: 2, total: 5 })).toMatchObject({ progreso: 42, etapa: "redactando", secciones: { hechas: 2, total: 5 } });
    expect(aActaDTO(fila({ progress: 90 }), { hechas: 5, total: 5 })).toMatchObject({ etapa: "armando" });
    // Sin saber las secciones, pasada la preparación se dice «redactando».
    expect(aActaDTO(fila({ progress: 30 }))).toMatchObject({ etapa: "redactando", secciones: null });
  });

  it("el avance se acota a 0-100", () => {
    expect(aActaDTO(fila({ progress: -4 })).progreso).toBe(0);
    expect(aActaDTO(fila({ progress: 250 })).progreso).toBe(100);
    expect(aActaDTO(fila({ progress: 33.6 })).progreso).toBe(34);
  });

  it("lista: trae lo pendiente de verificar, los requisitos y dónde abrir y descargar el documento", () => {
    const a = aActaDTO(fila({ status: "completed", progress: 100, completedAt: TERMINADA, outputFiles: SALIDA }));
    expect(a).toEqual({
      id: "gen1",
      estado: "lista",
      progreso: 100,
      etapa: null,
      secciones: null,
      creadaEn: "2026-10-05T15:00:00.000Z",
      terminadaEn: "2026-10-05T15:04:00.000Z",
      error: null,
      pendientes: ["La decisión D2 no quedó desarrollada.", "No se mencionó el lugar."],
      requisitos: [{ item: "Tipo de reunion", status: "completo", detail: "Consejo" }, { item: "Quórum", status: "pendiente", detail: "No se dijo" }],
      archivos: { html: "/api/download/gen1/acta", markdown: "/api/download/gen1/acta-markdown" },
    });
  });

  it("lista sin la revisión de requisitos (falló) sale igual, sin ella; y sin documento no hay archivos", () => {
    const sinRequisitos = { ...SALIDA, actaRequirements: undefined };
    expect(aActaDTO(fila({ status: "completed", completedAt: TERMINADA, outputFiles: sinRequisitos })).requisitos).toBeNull();
    expect(aActaDTO(fila({ status: "completed", completedAt: TERMINADA, outputFiles: {} })).archivos).toBeNull();
    expect(aActaDTO(fila({ status: "completed", completedAt: TERMINADA, outputFiles: null }))).toMatchObject({ pendientes: [], requisitos: null, archivos: null });
  });

  it("con error: dice cuál fue, y nada de lo demás", () => {
    const a = aActaDTO(fila({ status: "failed", errorMessage: "No pudimos redactar la sección «Informe de cartera y recaudo» del acta.", outputFiles: SALIDA }));
    expect(a).toMatchObject({ estado: "error", etapa: null, error: "No pudimos redactar la sección «Informe de cartera y recaudo» del acta.", archivos: null, pendientes: [], requisitos: null, terminadaEn: null });
    expect(aActaDTO(fila({ status: "failed", errorMessage: null })).error).toBe("No pudimos redactar el acta.");
  });

  it("no se fía de lo guardado: JSON roto, tipos raros o valores que no son texto", () => {
    const rota = { actaHtml: "x", actaPendientes: "{no es json", actaRequirements: "[1, 2]" };
    expect(aActaDTO(fila({ status: "completed", completedAt: TERMINADA, outputFiles: rota }))).toMatchObject({ pendientes: [], requisitos: null });
    for (const raro of ["texto", 7, [], true]) expect(() => aActaDTO(fila({ status: "completed", outputFiles: raro }))).not.toThrow();
  });

  it("una acta lista sin fecha de cierre no inventa una", () => {
    expect(aActaDTO(fila({ status: "completed", completedAt: null, outputFiles: SALIDA })).terminadaEn).toBeNull();
  });
});

describe("leerRequisitos y leerPendientes", () => {
  it("se quedan con lo que cuadra", () => {
    expect(leerRequisitos([{ item: " Quórum ", status: "pendiente", detail: " falta " }, { item: "", status: "completo" }, { item: "X", status: "raro" }, 3, null, { item: "Y", status: "completo" }])).toEqual([
      { item: "Quórum", status: "pendiente", detail: "falta" },
      { item: "Y", status: "completo", detail: "" },
    ]);
    expect(leerRequisitos([])).toBeNull();
    expect(leerRequisitos("x")).toBeNull();
    expect(leerPendientes(["a", "", "  ", 3, "b"])).toEqual(["a", "b"]);
    expect(leerPendientes({})).toEqual([]);
  });
  it("las direcciones de descarga pasan por la ruta autenticada, nunca por la del almacén", () => {
    expect(urlDeDescarga("g9", "acta")).toBe("/api/download/g9/acta");
    expect(urlDeDescarga("g9", "acta-markdown")).toBe("/api/download/g9/acta-markdown");
  });
});

/* ════════════════════════════════════════════════════════════════════
   Con la base de datos
   ════════════════════════════════════════════════════════════════════ */

describe("leerActa", () => {
  let db: DbFalsa;
  let raiz: string;
  let almacen: AlmacenLocal;
  beforeEach(() => {
    db = crearDbFalsa();
    fake.db = db;
    raiz ??= mkdtempSync(join(tmpdir(), "acta-estado-"));
    almacen = new AlmacenLocal(join(raiz, String(Math.random()).slice(2)));
  });
  afterAll(() => rmSync(raiz, { recursive: true, force: true }));

  const gen = (id: string, data: Record<string, unknown> = {}, creadaHace = 0) =>
    db.generation.create({ data: { id, userId: "u1", propertyId: "p1", type: "acta", status: "processing", progress: 0, meetingId: "r1", createdAt: new Date(Date.now() - creadaHace), ...data } });

  it("sin actas devuelve nada", async () => {
    expect(await leerActa("r1")).toEqual({ acta: null, texto: null });
  });

  it("devuelve la más reciente de ESA reunión, y solo las de tipo acta", async () => {
    await gen("vieja", { status: "completed" }, 60_000);
    await gen("nueva", { status: "processing" }, 1_000);
    await gen("de-otra", { meetingId: "r2" }, 0);
    await gen("informe", { type: "informe" }, 0);
    expect((await leerActa("r1")).acta).toMatchObject({ id: "nueva", estado: "procesando" });
    expect((await leerActa("r2")).acta).toMatchObject({ id: "de-otra" });
    expect((await leerActa("r3")).acta).toBeNull();
  });

  it("si la última falló, esa es la que se ve (con su mensaje): la anterior sigue en el Historial", async () => {
    await gen("buena", { status: "completed", outputFiles: SALIDA }, 60_000);
    await gen("mala", { status: "failed", errorMessage: "No pudimos redactar la sección «X» del acta." }, 1_000);
    expect((await leerActa("r1")).acta).toMatchObject({ id: "mala", estado: "error", error: "No pudimos redactar la sección «X» del acta." });
  });

  it("mientras se redacta cuenta las secciones hechas y las totales, de las tareas de ESA acta", async () => {
    await gen("g1", { progress: 40 });
    await db.meetingTask.create({ data: { meetingId: "r1", kind: "acta_calentar", key: claveActaCalentar("g1"), status: "hecha", payload: { generationId: "g1", secciones: SECCIONES } } });
    for (const s of SECCIONES) {
      await db.meetingTask.create({ data: { meetingId: "r1", kind: "acta_seccion", key: claveActaSeccion("g1", s.k), status: s.k < 2 ? "hecha" : "pendiente", payload: {} } });
    }
    // Las de otra acta de la misma reunión no cuentan.
    await db.meetingTask.create({ data: { meetingId: "r1", kind: "acta_seccion", key: claveActaSeccion("otra", 0), status: "hecha", payload: {} } });
    expect((await leerActa("r1")).acta).toMatchObject({ estado: "procesando", progreso: 40, etapa: "redactando", secciones: { hechas: 2, total: SECCIONES.length } });
  });

  it("recién creada, aún sin tareas legibles, no inventa secciones", async () => {
    await gen("g1");
    expect((await leerActa("r1")).acta).toMatchObject({ etapa: "preparando", secciones: null });
  });

  it("con el texto: lee del almacén el acta con sus marcadores, solo si se pide y está lista", async () => {
    const subido = await almacen.subir("generations/g1/acta-referencias.md", new TextEncoder().encode("## ACTA\n\n[[t=00:00:05]] Se trató &amp; más. [[D1]]"), "text/markdown");
    await gen("g1", { status: "completed", completedAt: TERMINADA, outputFiles: { ...SALIDA, actaReferencias: subido.url } });
    expect((await leerActa("r1", { conTexto: true, almacen })).texto).toBe("## ACTA\n\n[[t=00:00:05]] Se trató &amp; más. [[D1]]");
    expect((await leerActa("r1", { almacen })).texto).toBeNull();
    expect((await leerActa("r1", { conTexto: true })).texto).toBeNull();
  });

  it("si no se puede leer el texto, el acta se ve igual (sin él)", async () => {
    await gen("g1", { status: "completed", completedAt: TERMINADA, outputFiles: { ...SALIDA, actaReferencias: "local://generations/g1/no-existe.md" } });
    const r = await leerActa("r1", { conTexto: true, almacen });
    expect(r.texto).toBeNull();
    expect(r.acta).toMatchObject({ estado: "lista", archivos: { html: "/api/download/g1/acta" } });
  });

  it("no lee texto de un acta que se está redactando ni de una con error", async () => {
    await gen("g1", { status: "processing", outputFiles: SALIDA });
    expect((await leerActa("r1", { conTexto: true, almacen })).texto).toBeNull();
    db.generation.filas.length = 0;
    await gen("g2", { status: "failed", outputFiles: SALIDA });
    expect((await leerActa("r1", { conTexto: true, almacen })).texto).toBeNull();
  });
});
