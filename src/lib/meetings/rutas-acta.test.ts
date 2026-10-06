/** Las rutas del acta: pedirla (POST), seguirla (GET), retomarla, y el modo demo. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, empujar, cupo, almacenes } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  empujar: vi.fn(),
  cupo: vi.fn(),
  almacenes: { actual: null as unknown },
}));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/empujon", () => ({ empujar: (...a: unknown[]) => empujar(...a) }));
vi.mock("@/lib/usage", () => ({ checkUsageLimits: (...a: unknown[]) => cupo(...a) }));
vi.mock("@/lib/meetings/almacen-blob", () => ({ almacenBlob: () => almacenes.actual }));

import { GET as leerActa, POST as pedirActa } from "@/app/api/meetings/[id]/acta/route";
import { DEMO_USER, reiniciarDemoGeneraciones } from "@/lib/demo-store";
import { AlmacenLocal } from "./almacen-local";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { reiniciarDemoReuniones } from "./demo";
import { reiniciarDemoActas } from "./demo-acta";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, construirIntervenciones } from "./demo-datos";

let db: DbFalsa;
let raiz: string;
const ID = "mreunion1";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const pedir = (url = "/m", metodo = "GET", cuerpo?: unknown) =>
  new NextRequest(`http://localhost/api${url}`, { method: metodo, ...(cuerpo !== undefined ? { body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), headers: { "content-type": "application/json" } } : {}) });
const json = async (r: Response) => ({ status: r.status, cuerpo: await r.json(), cabeceras: r.headers });

async function sembrarReunion(extra: Record<string, unknown> = {}) {
  await db.meeting.create({
    data: {
      id: ID, userId: "u1", propertyId: "prop1", type: "consejo", title: "Reunión de consejo", date: new Date("2026-09-16T00:00:00Z"), status: "lista",
      durationMs: DURACION_SEPTIEMBRE_MS, digest: structuredClone(FICHA_SEPTIEMBRE), property: { name: "Los Pinos" }, ...extra,
    },
  });
  construirIntervenciones().forEach((u, idx) => db.meetingUtterance.filas.push({ id: u.id, meetingId: ID, idx, startMs: u.startMs, endMs: u.endMs, speaker: u.speaker, text: u.text }));
}

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  raiz ??= mkdtempSync(join(tmpdir(), "rutas-acta-"));
  almacenes.actual = new AlmacenLocal(join(raiz, String(Math.random()).slice(2)));
  auth.mockReset();
  empujar.mockReset();
  cupo.mockReset();
  cupo.mockResolvedValue({ allowed: true });
  vi.stubEnv("DEMO_MODE", "false");
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", role: "admin" } });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => rmSync(raiz, { recursive: true, force: true }));

/* ════════════════════════════════════════════════════════════════════
   POST
   ════════════════════════════════════════════════════════════════════ */

describe("POST /api/meetings/[id]/acta", () => {
  it("empieza el acta: 201 con su estado, mira el cupo de quien la pide y empuja al trabajador", async () => {
    await sembrarReunion();
    const r = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
    expect(r.status).toBe(201);
    expect(r.cuerpo.yaEnCurso).toBe(false);
    expect(r.cuerpo.acta).toMatchObject({ estado: "procesando", progreso: 0, etapa: "preparando", error: null });
    expect(cupo).toHaveBeenCalledWith("u1");
    expect(empujar).toHaveBeenCalledTimes(1);
    expect(db.generation.filas).toHaveLength(1);
    expect(db.generation.filas[0]).toMatchObject({ id: r.cuerpo.acta.id, userId: "u1", type: "acta", meetingId: ID, status: "processing" });
    expect(db.meetingTask.filas.map((t) => t.kind)).toEqual(["acta_calentar"]);
  });

  it("sin cuerpo, con cuerpo vacío o ilegible también empieza el acta", async () => {
    await sembrarReunion();
    expect((await pedirActa(pedir("/m", "POST"), ctx())).status).toBe(201);
    db.generation.filas.length = 0;
    db.meetingTask.filas.length = 0;
    expect((await pedirActa(pedir("/m", "POST", "{no es json"), ctx())).status).toBe(201);
  });

  it("un doble clic devuelve la misma acta con 200 y no gasta otra generación (ni mira el cupo)", async () => {
    await sembrarReunion();
    const a = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
    cupo.mockClear();
    const b = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
    expect(b.status).toBe(200);
    expect(b.cuerpo).toMatchObject({ yaEnCurso: true, acta: { id: a.cuerpo.acta.id } });
    expect(db.generation.filas).toHaveLength(1);
    expect(cupo).not.toHaveBeenCalled();
    expect(empujar).toHaveBeenCalledTimes(2); // por si el trabajador anterior murió
  });

  it("sin cupo en el plan: 429 con la razón, y no crea nada ni empuja", async () => {
    await sembrarReunion();
    cupo.mockResolvedValue({ allowed: false, reason: "Has alcanzado el límite diario de 3 generaciones." });
    const r = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
    expect(r).toMatchObject({ status: 429, cuerpo: { error: "Has alcanzado el límite diario de 3 generaciones." } });
    expect(db.generation.filas).toHaveLength(0);
    expect(empujar).not.toHaveBeenCalled();
  });

  it("una reunión que aún se procesa o sin transcripción: 409; de otra persona o inexistente: 404; sin empujar", async () => {
    await sembrarReunion({ status: "procesando" });
    expect((await json(await pedirActa(pedir("/m", "POST", {}), ctx()))).status).toBe(409);
    await db.meeting.updateMany({ where: { id: ID }, data: { status: "lista" } });
    db.meetingUtterance.filas.length = 0;
    const sin = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
    expect(sin.status).toBe(409);
    expect(sin.cuerpo.error).toMatch(/no tiene transcripción/);
    expect((await pedirActa(pedir("/m", "POST", {}), ctx("no-existe"))).status).toBe(404);
    await db.meeting.updateMany({ where: { id: ID }, data: { userId: "otro" } });
    expect((await pedirActa(pedir("/m", "POST", {}), ctx())).status).toBe(404);
    expect(empujar).not.toHaveBeenCalled();
    expect(db.generation.filas).toHaveLength(0);
  });

  describe("retomar un acta con error ({ reanudar })", () => {
    async function conActaConError() {
      await sembrarReunion();
      const a = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
      await db.generation.updateMany({ where: { id: a.cuerpo.acta.id }, data: { status: "failed", errorMessage: "No pudimos redactar la sección «X» del acta." } });
      empujar.mockClear();
      cupo.mockClear();
      return a.cuerpo.acta.id as string;
    }

    it("la retoma: 200, vuelve a «procesando», mira el cupo y empuja", async () => {
      const id = await conActaConError();
      const r = await json(await pedirActa(pedir("/m", "POST", { reanudar: id }), ctx()));
      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ yaEnCurso: false, acta: { id, estado: "procesando", error: null } });
      expect(cupo).toHaveBeenCalledWith("u1");
      expect(empujar).toHaveBeenCalledTimes(1);
      expect(db.generation.filas).toHaveLength(1);
    });

    it("sin cupo: 429 y el acta sigue con su error", async () => {
      const id = await conActaConError();
      cupo.mockResolvedValue({ allowed: false, reason: "Has alcanzado el límite mensual de 15 generaciones." });
      const r = await json(await pedirActa(pedir("/m", "POST", { reanudar: id }), ctx()));
      expect(r.status).toBe(429);
      expect(db.generation.filas[0].status).toBe("failed");
      expect(empujar).not.toHaveBeenCalled();
    });

    it("un acta que no está en error (en curso, de otra reunión o inexistente): 409", async () => {
      const id = await conActaConError();
      expect((await pedirActa(pedir("/m", "POST", { reanudar: "no-existe" }), ctx())).status).toBe(409);
      await db.generation.updateMany({ where: { id }, data: { status: "processing" } });
      expect((await pedirActa(pedir("/m", "POST", { reanudar: id }), ctx())).status).toBe(409);
      await db.generation.updateMany({ where: { id }, data: { status: "failed", meetingId: "otra-reunion" } });
      expect((await pedirActa(pedir("/m", "POST", { reanudar: id }), ctx())).status).toBe(409);
    });

    it("un identificador raro es un 400, no llega a la base de datos", async () => {
      await sembrarReunion();
      const consulta = vi.spyOn(db.generation, "findFirst");
      for (const raro of [5, "", "a b", "../x", "x".repeat(65), null, {}, ["x"]]) {
        const r = await json(await pedirActa(pedir("/m", "POST", { reanudar: raro }), ctx()));
        expect(r.status, JSON.stringify(raro)).toBe(400);
      }
      expect(consulta).not.toHaveBeenCalled();
    });
  });

  it("un fallo de la base de datos es un 500 sin detalles internos", async () => {
    await sembrarReunion();
    db.generation.create = async () => {
      throw new Error("connection refused: postgres://secreto");
    };
    const r = await json(await pedirActa(pedir("/m", "POST", {}), ctx()));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain("secreto");
  });
});

/* ════════════════════════════════════════════════════════════════════
   GET
   ════════════════════════════════════════════════════════════════════ */

describe("GET /api/meetings/[id]/acta", () => {
  it("sin ninguna acta pedida: { acta: null, texto: null }, sin caché", async () => {
    await sembrarReunion();
    const r = await json(await leerActa(pedir(), ctx()));
    expect(r.status).toBe(200);
    expect(r.cuerpo).toEqual({ acta: null, texto: null });
    expect(r.cabeceras.get("cache-control")).toBe("no-store");
  });

  it("mientras se redacta dice el avance y, si hay trabajo sin atender, empuja al trabajador", async () => {
    await sembrarReunion();
    await pedirActa(pedir("/m", "POST", {}), ctx());
    empujar.mockClear();
    const r = await json(await leerActa(pedir(), ctx()));
    expect(r.cuerpo.acta).toMatchObject({ estado: "procesando", etapa: "preparando" });
    expect(empujar).toHaveBeenCalledTimes(1);
  });

  it("no empuja si alguien trabaja y avisó hace poco, ni si la tarea espera su reintento", async () => {
    await sembrarReunion();
    await pedirActa(pedir("/m", "POST", {}), ctx());
    const calentar = db.meetingTask.filas.find((t) => String(t.key).endsWith(":calentar"))!;
    empujar.mockClear();
    await db.meetingTask.updateMany({ where: { id: calentar.id }, data: { status: "en_curso", lockedAt: new Date() } });
    await leerActa(pedir(), ctx());
    await db.meetingTask.updateMany({ where: { id: calentar.id }, data: { status: "pendiente", lockedAt: null, runAfter: new Date(Date.now() + 120_000) } });
    await leerActa(pedir(), ctx());
    expect(empujar).not.toHaveBeenCalled();
  });

  it("lista: trae los pendientes, los requisitos y los archivos; con ?texto=1, el acta con sus marcadores", async () => {
    await sembrarReunion();
    const almacen = almacenes.actual as AlmacenLocal;
    const subido = await almacen.subir("generations/g1/acta-referencias.md", new TextEncoder().encode("## ACTA\n\n[[t=00:00:05]] Se trató. [[D1]]"), "text/markdown");
    await db.generation.create({
      data: {
        id: "g1", userId: "u1", propertyId: "prop1", type: "acta", status: "completed", progress: 100, meetingId: ID, completedAt: new Date(),
        outputFiles: { actaHtml: "local://x", actaReferencias: subido.url, actaPendientes: JSON.stringify(["Falta el lugar."]), actaRequirements: JSON.stringify([{ item: "Quórum", status: "pendiente", detail: "No se dijo" }]) },
      },
    });
    const sin = await json(await leerActa(pedir(), ctx()));
    expect(sin.cuerpo.acta).toMatchObject({ id: "g1", estado: "lista", pendientes: ["Falta el lugar."], archivos: { html: "/api/download/g1/acta", markdown: "/api/download/g1/acta-markdown" } });
    expect(sin.cuerpo.texto).toBeNull();
    const con = await json(await leerActa(pedir("/m?texto=1"), ctx()));
    expect(con.cuerpo.texto).toBe("## ACTA\n\n[[t=00:00:05]] Se trató. [[D1]]");
    expect(empujar).not.toHaveBeenCalled();
    // Nunca se manda la dirección del almacén: los archivos pasan por la ruta autenticada.
    expect(JSON.stringify(con.cuerpo)).not.toContain("local://");
  });

  it("con error: dice cuál fue y no empuja", async () => {
    await sembrarReunion();
    await db.generation.create({ data: { id: "g1", userId: "u1", propertyId: "prop1", type: "acta", status: "failed", meetingId: ID, errorMessage: "No pudimos redactar la sección «X» del acta." } });
    const r = await json(await leerActa(pedir(), ctx()));
    expect(r.cuerpo.acta).toMatchObject({ estado: "error", error: "No pudimos redactar la sección «X» del acta." });
    expect(empujar).not.toHaveBeenCalled();
  });

  it("una reunión de otra persona o inexistente: 404 (sin revelar si existe)", async () => {
    await sembrarReunion({ userId: "otro" });
    await db.generation.create({ data: { id: "g1", userId: "otro", propertyId: "prop1", type: "acta", status: "completed", meetingId: ID } });
    expect(await json(await leerActa(pedir(), ctx()))).toMatchObject({ status: 404, cuerpo: { error: "Reunión no encontrada" } });
    expect((await leerActa(pedir(), ctx("no-existe"))).status).toBe(404);
  });

  it("un fallo de la base de datos es un 500 sin detalles internos", async () => {
    await sembrarReunion();
    db.generation.findFirst = async () => {
      throw new Error("connection refused: postgres://secreto");
    };
    const r = await json(await leerActa(pedir(), ctx()));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.cuerpo)).not.toContain("secreto");
  });
});

/* ════════════════════════════════════════════════════════════════════
   El piloto y el demo
   ════════════════════════════════════════════════════════════════════ */

describe("quién puede usarlas", () => {
  it("sin sesión: 401; una cuenta normal: 404 (el piloto es solo para administradores), y la base de datos no se toca", async () => {
    await sembrarReunion();
    const tocar = vi.spyOn(db.meeting, "findFirst");
    auth.mockResolvedValue(null);
    expect((await leerActa(pedir(), ctx())).status).toBe(401);
    expect((await pedirActa(pedir("/m", "POST", {}), ctx())).status).toBe(401);
    auth.mockResolvedValue({ user: { id: "u1", email: "ana@x.com", role: "user" } });
    expect((await leerActa(pedir(), ctx())).status).toBe(404);
    expect((await pedirActa(pedir("/m", "POST", {}), ctx())).status).toBe(404);
    expect(tocar).not.toHaveBeenCalled();
    expect(empujar).not.toHaveBeenCalled();
  });
});

describe("modo demo (sin base de datos ni claves)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    auth.mockResolvedValue({ user: { id: DEMO_USER.id, email: DEMO_USER.email, role: "user" } });
    reiniciarDemoReuniones();
    reiniciarDemoActas();
    reiniciarDemoGeneraciones();
    // Si una ruta de demo tocara `db`, esto explotaría.
    fake.db = new Proxy({}, { get: () => { throw new Error("el demo no debe tocar la base de datos"); } });
  });

  it("GET: sin acta todavía, null; con una reunión que no existe, 404", async () => {
    expect(await json(await leerActa(pedir(), ctx("reunion-demo-001")))).toMatchObject({ status: 200, cuerpo: { acta: null, texto: null } });
    expect((await leerActa(pedir(), ctx("no-existe"))).status).toBe(404);
  });

  it("POST: 201 y la acta empieza; otra vez, 200 con la misma; no toca db ni empuja trabajadores", async () => {
    const a = await json(await pedirActa(pedir("/m", "POST", {}), ctx("reunion-demo-001")));
    expect(a.status).toBe(201);
    expect(a.cuerpo).toMatchObject({ yaEnCurso: false, acta: { estado: "procesando" } });
    const b = await json(await pedirActa(pedir("/m", "POST", {}), ctx("reunion-demo-001")));
    expect(b).toMatchObject({ status: 200, cuerpo: { yaEnCurso: true, acta: { id: a.cuerpo.acta.id } } });
    expect(empujar).not.toHaveBeenCalled();
    expect(cupo).not.toHaveBeenCalled();
  });

  it("los motivos por los que no se puede: 409 (reunión sin terminar), 404 y 400 con un identificador raro", async () => {
    expect((await pedirActa(pedir("/m", "POST", {}), ctx("reunion-demo-002"))).status).toBe(409);
    expect((await pedirActa(pedir("/m", "POST", {}), ctx("no-existe"))).status).toBe(404);
    expect((await pedirActa(pedir("/m", "POST", { reanudar: "a b" }), ctx("reunion-demo-001"))).status).toBe(400);
    expect((await pedirActa(pedir("/m", "POST", { reanudar: "no-existe" }), ctx("reunion-demo-001"))).status).toBe(409);
  });

  it("sin cupo (3 generaciones por día en el demo): 429", async () => {
    const { createGeneration, getProperties, updateGeneration } = await import("@/lib/demo-store");
    const prop = getProperties(DEMO_USER.id)[0];
    for (let i = 0; i < 3; i++) {
      const g = createGeneration({ userId: DEMO_USER.id, propertyId: prop.id, type: "informe", status: "processing", month: 10, year: 2026, inputFiles: [], inputText: null, outputFiles: null, tokensUsed: 0, costUsd: 0, errorMessage: null, property: prop });
      updateGeneration(g.id, { status: "completed" });
    }
    const r = await json(await pedirActa(pedir("/m", "POST", {}), ctx("reunion-demo-001")));
    expect(r).toMatchObject({ status: 429, cuerpo: { error: "Has alcanzado el límite diario de 3 generaciones." } });
  });
});
