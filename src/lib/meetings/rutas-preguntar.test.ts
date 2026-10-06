/** La ruta «Preguntar»: SSE con la respuesta por trozos, sus guardas (404, 409, 429, 503), el registro de uso y el modo demo. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { auth, fake, cupo, iaActual } = vi.hoisted(() => ({
  auth: vi.fn(),
  fake: { db: null as unknown },
  cupo: vi.fn(),
  iaActual: { actual: null as unknown },
}));
vi.mock("@/lib/auth", () => ({ auth: (...a: unknown[]) => auth(...a) }));
vi.mock("@/lib/db", () => ({ get db() { return fake.db; } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/meetings/cupo-preguntas", async (original) => ({ ...(await original<typeof import("@/lib/meetings/cupo-preguntas")>()), comprobarCupoDePreguntas: (...a: unknown[]) => cupo(...a) }));
vi.mock("@/lib/meetings/ia", async (original) => ({ ...(await original<typeof import("@/lib/meetings/ia")>()), crearClienteIA: () => iaActual.actual }));

import { POST as preguntar } from "@/app/api/meetings/[id]/preguntar/route";
import { DEMO_USER } from "@/lib/demo-store";
import { TIPO_DE_USO_PREGUNTA } from "./cupo-preguntas";
import { crearDbFalsa, type DbFalsa } from "./db-falsa";
import { reiniciarDemoReuniones } from "./demo";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE, construirHablantes, construirIntervenciones } from "./demo-datos";
import { ErrorIA, tokensDeUso, type UsoIA } from "./ia";
import { crearIASimulada, type IASimulada } from "./ia-simulada";
import { SISTEMA_DE_PREGUNTAR } from "./preguntar";
import { leerEventosSSE, type EventoSSE } from "./sse";

let db: DbFalsa;
let ia: IASimulada;
const ID = "mreunion1";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const pedir = (cuerpo: unknown) =>
  new NextRequest("http://localhost/api/meetings/x/preguntar", {
    method: "POST",
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    headers: { "content-type": "application/json" },
  });
const eventos = async (r: Response): Promise<EventoSSE[]> => {
  const salida: EventoSSE[] = [];
  for await (const e of leerEventosSSE(r.body!)) salida.push(e);
  return salida;
};
const textoDe = (es: EventoSSE[]): string => es.filter((e) => e.evento === "delta").map((e) => (e.datos as { texto: string }).texto).join("");

async function sembrarReunion(extra: Record<string, unknown> = {}) {
  await db.meeting.create({
    data: {
      id: ID, userId: "u1", propertyId: "prop1", type: "consejo", title: "Reunión de consejo", date: new Date("2026-09-16T00:00:00Z"), status: "lista",
      durationMs: DURACION_SEPTIEMBRE_MS, digest: structuredClone(FICHA_SEPTIEMBRE), property: { name: "Los Pinos" }, ...extra,
    },
  });
  const intervenciones = construirIntervenciones();
  intervenciones.forEach((u, idx) => db.meetingUtterance.filas.push({ id: u.id, meetingId: ID, idx, startMs: u.startMs, endMs: u.endMs, speaker: u.speaker, text: u.text }));
  for (const h of construirHablantes(intervenciones)) await db.meetingSpeaker.create({ data: { meetingId: ID, label: h.label, name: h.name, role: h.role, talkMs: h.talkMs } });
}

beforeEach(() => {
  db = crearDbFalsa();
  fake.db = db;
  ia = crearIASimulada();
  iaActual.actual = ia;
  auth.mockReset();
  cupo.mockReset();
  cupo.mockResolvedValue({ permitido: true, ilimitado: false, usadoHoy: 3, limiteHoy: 30, usadoEstaSemana: 3, limiteSemana: 150, mensaje: null });
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba");
  auth.mockResolvedValue({ user: { id: "u1", email: "u1@x.com", role: "admin" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/meetings/[id]/preguntar", () => {
  it("responde por SSE: «inicio», la respuesta por trozos y «done»; con los encabezados que evitan que se junte", async () => {
    await sembrarReunion();
    const r = await preguntar(pedir({ pregunta: "¿Qué se dijo sobre las cámaras?" }), ctx());
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(r.headers.get("x-accel-buffering")).toBe("no");
    const es = await eventos(r);
    expect(es[0]).toEqual({ evento: "inicio", datos: {} });
    expect(es[es.length - 1]).toEqual({ evento: "done", datos: { cortada: false, modelo: "claude-opus-5-5" } });
    expect(es.filter((e) => e.evento === "delta").length).toBeGreaterThan(1);
    expect(textoDe(es)).toMatch(/cámaras/i);
    expect(textoDe(es)).toMatch(/\[\[t=\d{2}:\d{2}:\d{2}\]\]/);
    expect(es.some((e) => e.evento === "error")).toBe(false);
  });

  it("le manda a la IA el sistema de «Preguntar», la pregunta y el historial (ya normalizado)", async () => {
    await sembrarReunion();
    const r = await preguntar(pedir({ pregunta: "  ¿Y la cartera?  ", historial: [{ rol: "assistant", texto: "huérfana" }, { rol: "user", texto: "¿Y los ascensores?" }, { rol: "assistant", texto: "Se prorrogó." }] }), ctx());
    await eventos(r);
    expect(ia.textos).toHaveLength(1);
    expect(ia.textos[0].sistema).toBe(SISTEMA_DE_PREGUNTAR);
    expect(ia.textos[0].turnos).toEqual([
      { rol: "user", texto: "¿Y los ascensores?" }, { rol: "assistant", texto: "Se prorrogó." }, { rol: "user", texto: "¿Y la cartera?" },
    ]);
    expect(ia.textos[0].compartido).toContain("TRANSCRIPCIÓN COMPLETA");
  });

  it("deja registrada cada pregunta: su costo y sus tokens (y así cuenta para el cupo), una sola vez", async () => {
    await sembrarReunion();
    let uso: UsoIA | null = null;
    const original = ia.generarTexto.bind(ia);
    ia.generarTexto = async (entrada) => {
      const respuesta = await original(entrada);
      uso = respuesta.uso;
      return respuesta;
    };
    await eventos(await preguntar(pedir({ pregunta: "¿Qué quedó pendiente?" }), ctx()));
    expect(db.usageRecord.filas).toHaveLength(1);
    expect(db.usageRecord.filas[0]).toMatchObject({ userId: "u1", type: TIPO_DE_USO_PREGUNTA, tokens: Math.round(tokensDeUso(uso!)) });
    expect(db.usageRecord.filas[0].costUsd as number).toBeCloseTo(uso!.costoUsd, 12);
    expect(uso!.costoUsd).toBeGreaterThan(0);
  });

  it("un fallo al registrar el uso no tumba la respuesta", async () => {
    await sembrarReunion();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.usageRecord.create = async () => {
      throw new Error("connection refused");
    };
    const es = await eventos(await preguntar(pedir({ pregunta: "¿Qué quedó pendiente?" }), ctx()));
    expect(es[es.length - 1].evento).toBe("done");
    log.mockRestore();
  });

  describe("antes de empezar a responder (JSON, sin gastar nada)", () => {
    it("pregunta vacía, muy larga o cuerpo ilegible: 400, sin tocar la base de datos ni la IA", async () => {
      await sembrarReunion();
      const tocar = vi.spyOn(db.meeting, "findFirst");
      for (const malo of [{}, { pregunta: "" }, { pregunta: "   " }, { pregunta: 7 }, { pregunta: "x".repeat(2_001) }, "{no es json", null]) {
        const r = await preguntar(pedir(malo), ctx());
        expect(r.status, JSON.stringify(malo)).toBe(400);
        expect(typeof (await r.json()).error).toBe("string");
      }
      expect(tocar).not.toHaveBeenCalled();
      expect(ia.textos).toHaveLength(0);
    });

    it("una reunión de otra persona o inexistente: 404; que aún se procesa o sin transcripción: 409", async () => {
      await sembrarReunion({ userId: "otro" });
      expect((await preguntar(pedir({ pregunta: "hola" }), ctx())).status).toBe(404);
      expect((await preguntar(pedir({ pregunta: "hola" }), ctx("no-existe"))).status).toBe(404);
      await db.meeting.updateMany({ where: { id: ID }, data: { userId: "u1", status: "procesando" } });
      const aun = await preguntar(pedir({ pregunta: "hola" }), ctx());
      expect(aun.status).toBe(409);
      expect((await aun.json()).error).toBe("Esta reunión todavía se está procesando.");
      await db.meeting.updateMany({ where: { id: ID }, data: { status: "lista" } });
      db.meetingUtterance.filas.length = 0;
      const sin = await preguntar(pedir({ pregunta: "hola" }), ctx());
      expect(sin.status).toBe(409);
      expect((await sin.json()).error).toMatch(/no tiene transcripción/);
      expect(ia.textos).toHaveLength(0);
      expect(cupo).not.toHaveBeenCalled(); // lo que no se puede preguntar ni siquiera gasta cupo
    });

    it("sin cupo en el plan: 429 con el motivo, y sin llamar a la IA", async () => {
      await sembrarReunion();
      cupo.mockResolvedValue({ permitido: false, ilimitado: false, usadoHoy: 30, limiteHoy: 30, usadoEstaSemana: 30, limiteSemana: 150, mensaje: "Has alcanzado el límite diario de 30 mensajes. Intenta mañana." });
      const r = await preguntar(pedir({ pregunta: "hola" }), ctx());
      expect(r.status).toBe(429);
      expect(await r.json()).toEqual({ error: "Has alcanzado el límite diario de 30 mensajes. Intenta mañana." });
      expect(cupo).toHaveBeenCalledWith("u1");
      expect(ia.textos).toHaveLength(0);
      expect(db.usageRecord.filas).toHaveLength(0);
    });

    it("sin la clave de la IA: 503 claro, no un flujo que falla", async () => {
      await sembrarReunion();
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = await preguntar(pedir({ pregunta: "hola" }), ctx());
      expect(r.status).toBe(503);
      expect((await r.json()).error).toBe("El servicio de IA no está configurado. Avisa a soporte.");
      log.mockRestore();
    });

    it("un fallo de la base de datos es un 500 sin detalles internos", async () => {
      await sembrarReunion();
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      db.meeting.findFirst = async () => {
        throw new Error("connection refused: postgres://secreto");
      };
      const r = await preguntar(pedir({ pregunta: "hola" }), ctx());
      expect(r.status).toBe(500);
      expect(JSON.stringify(await r.json())).not.toContain("secreto");
      log.mockRestore();
    });
  });

  describe("cuando algo falla a mitad de la respuesta", () => {
    it("el fallo de la IA llega como evento «error» con su mensaje en español, sin «done» y sin registrar uso", async () => {
      await sembrarReunion();
      ia = crearIASimulada({ alLlamarTexto: () => { throw new ErrorIA("El servicio de IA está saturado. Se vuelve a intentar.", { reintentable: true }); } });
      iaActual.actual = ia;
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const es = await eventos(await preguntar(pedir({ pregunta: "hola" }), ctx()));
      expect(es).toEqual([{ evento: "inicio", datos: {} }, { evento: "error", datos: { mensaje: "El servicio de IA está saturado. Se vuelve a intentar." } }]);
      expect(db.usageRecord.filas).toHaveLength(0);
      log.mockRestore();
    });

    it("un error cualquiera (de red, de código) sale genérico: nunca detalles internos", async () => {
      await sembrarReunion();
      ia = crearIASimulada({ alLlamarTexto: () => { throw new Error("postgres://secreto"); } });
      iaActual.actual = ia;
      const es = await eventos(await preguntar(pedir({ pregunta: "hola" }), ctx()));
      expect(es[es.length - 1]).toEqual({ evento: "error", datos: { mensaje: "No pudimos terminar la respuesta. Inténtalo de nuevo." } });
      expect(JSON.stringify(es)).not.toContain("secreto");
    });

    it("si la reunión cambia justo entre la comprobación y la respuesta (una carrera), el flujo dice por qué y no registra nada", async () => {
      await sembrarReunion();
      const original = db.meeting.findFirst.bind(db.meeting);
      let llamadas = 0;
      db.meeting.findFirst = async (args) => {
        const fila = await original(args);
        // La primera mirada (la de la ruta) la ve lista; cuando se carga el contexto, ya empezó a reprocesarse.
        return fila && ++llamadas > 1 ? { ...fila, status: "procesando" } : fila;
      };
      const es = await eventos(await preguntar(pedir({ pregunta: "hola" }), ctx()));
      expect(es).toEqual([{ evento: "inicio", datos: {} }, { evento: "error", datos: { mensaje: "Esta reunión todavía se está procesando." } }]);
      expect(db.usageRecord.filas).toHaveLength(0);
      expect(ia.textos).toHaveLength(0);
    });

    it("si la persona se va (cierra la página), se cancela la señal de la IA: deja de gastar", async () => {
      await sembrarReunion();
      let soltar!: () => void;
      ia = crearIASimulada({ alLlamarTexto: () => new Promise<void>((r) => (soltar = r)) });
      iaActual.actual = ia;
      const r = await preguntar(pedir({ pregunta: "hola" }), ctx());
      const lector = r.body!.getReader();
      await lector.read(); // «inicio»
      await vi.waitFor(() => expect(ia.textos).toHaveLength(1));
      expect(ia.textos[0].senal!.aborted).toBe(false);
      await lector.cancel();
      expect(ia.textos[0].senal!.aborted).toBe(true);
      soltar();
    });
  });
});

describe("quién puede usarla", () => {
  it("sin sesión: 401; una cuenta normal: 404 (el piloto es solo para administradores); sin tocar la base de datos ni la IA", async () => {
    await sembrarReunion();
    const tocar = vi.spyOn(db.meeting, "findFirst");
    auth.mockResolvedValue(null);
    expect((await preguntar(pedir({ pregunta: "hola" }), ctx())).status).toBe(401);
    auth.mockResolvedValue({ user: { id: "u1", email: "ana@x.com", role: "user" } });
    expect((await preguntar(pedir({ pregunta: "hola" }), ctx())).status).toBe(404);
    expect(tocar).not.toHaveBeenCalled();
    expect(ia.textos).toHaveLength(0);
  });
});

describe("modo demo (sin base de datos ni claves)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    auth.mockResolvedValue({ user: { id: DEMO_USER.id, email: DEMO_USER.email, role: "user" } });
    reiniciarDemoReuniones();
    // Si una ruta de demo tocara `db`, esto explotaría.
    fake.db = new Proxy({}, { get: () => { throw new Error("el demo no debe tocar la base de datos"); } });
  });

  it("responde por SSE con el mismo formato, citando minutos de la reunión de ejemplo, sin tocar db, sin cupo y sin la IA de verdad", async () => {
    const r = await preguntar(pedir({ pregunta: "¿Qué se decidió sobre los ascensores?" }), ctx("reunion-demo-001"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    const es = await eventos(r);
    expect(es[0].evento).toBe("inicio");
    expect(es[es.length - 1]).toEqual({ evento: "done", datos: { cortada: false, modelo: "claude-opus-5-5" } });
    expect(es.filter((e) => e.evento === "delta").length).toBeGreaterThan(1);
    const texto = textoDe(es);
    expect(texto).toMatch(/ascensores|Schindler/i);
    expect(texto).toMatch(/\[\[t=\d{2}:\d{2}:\d{2}\]\]/);
    expect(cupo).not.toHaveBeenCalled();
    expect(ia.textos).toHaveLength(0);
  });

  it("lo que no está en la reunión lo dice", async () => {
    const es = await eventos(await preguntar(pedir({ pregunta: "¿Hablaron del paintball?" }), ctx("reunion-demo-001")));
    expect(textoDe(es)).toBe("No encuentro eso en la reunión: no aparece en la transcripción.");
  });

  it("los motivos por los que no se puede: 404, 409 (reunión sin terminar) y 400", async () => {
    expect((await preguntar(pedir({ pregunta: "hola" }), ctx("no-existe"))).status).toBe(404);
    for (const id of ["reunion-demo-002", "reunion-demo-003", "reunion-demo-004", "reunion-demo-005"]) {
      expect((await preguntar(pedir({ pregunta: "hola" }), ctx(id))).status, id).toBe(409);
    }
    expect((await preguntar(pedir({ pregunta: "" }), ctx("reunion-demo-001"))).status).toBe(400);
  });
});
