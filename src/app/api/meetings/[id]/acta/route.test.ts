import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El candado de generación retiene una conexión del pool: dentro de la transacción solo puede haber `tx` (los dos conteos y la
 * fila). Esta base falsa lo vigila: cualquier llamada a la conexión global (o a algo lento) mientras hay una transacción abierta
 * queda anotada en `violaciones`. Las transacciones se serializan (como el candado de asesoría) y comparten filas.
 */
const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  usage: vi.fn(),
  leer: vi.fn(),
  contarActas: vi.fn(),
  tx: { abierta: false, cola: Promise.resolve() as Promise<unknown> },
  filas: [] as Array<Record<string, unknown>>,
  orden: [] as string[],
  violaciones: [] as string[],
  lock: vi.fn(),
  reanudado: vi.fn(),
  preparar: vi.fn(),
  prepararReanudar: vi.fn(),
  CUPO: { max: 3 },
}));

const enGlobal = (que: string) => { if (m.tx.abierta) m.violaciones.push(que); };

vi.mock("@/lib/db", () => ({
  db: {
    generation: { count: async () => { enGlobal("db.generation.count"); return m.filas.length; } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>, opciones?: { timeout?: number }) => {
      m.orden.push("tx-abre");
      expect(opciones?.timeout).toBeLessThanOrEqual(10_000);
      const anterior = m.tx.cola;
      let suelta!: () => void;
      m.tx.cola = new Promise<void>((r) => { suelta = r; });
      await anterior; // el candado de asesoría: de uno en uno
      m.tx.abierta = true;
      try {
        return await fn({
          $executeRaw: async (...a: unknown[]) => { m.orden.push("candado"); m.lock(...a); },
          generation: {
            count: async ({ where }: { where: Record<string, unknown> }) => {
              m.orden.push("tx-count");
              return "meetingId" in where ? m.contarActas(where) : m.filas.length;
            },
            create: async ({ data }: { data: Record<string, unknown> }) => {
              m.orden.push("tx-create");
              const fila = { id: `g${m.filas.length + 1}`, ...data };
              m.filas.push(fila);
              return fila;
            },
            updateMany: async () => { m.orden.push("tx-reanudar-generacion"); return { count: m.reanudado() ? 1 : 0 }; },
          },
          meetingTask: { updateMany: async () => { m.orden.push("tx-reanudar-tareas"); return { count: 1 }; } },
        });
      } finally {
        m.tx.abierta = false;
        m.orden.push("tx-cierra");
        suelta();
      }
    },
  },
}));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: async () => {} }));
vi.mock("@/lib/usage", () => ({ checkUsageLimits: (...a: unknown[]) => m.usage(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => m.rateLimit(...a) }));
vi.mock("@/lib/meetings/acta-orquestador", () => ({
  prepararInicioActa: (...a: unknown[]) => { enGlobal("prepararInicioActa"); m.orden.push("preparar"); return m.preparar(...a); },
  prepararReanudacion: (...a: unknown[]) => { enGlobal("prepararReanudacion"); return m.prepararReanudar(...a); },
  crearGeneracionDeActa: async (tx: { generation: { create: (a: { data: Record<string, unknown> }) => Promise<{ id: string }> } }, e: { userId: string; meetingId: string }) =>
    (await tx.generation.create({ data: { userId: e.userId, meetingId: e.meetingId, type: "acta", status: "processing" } })).id,
  reanudarActaEnTransaccion: async (tx: { generation: { updateMany: (a: unknown) => Promise<{ count: number }> }; meetingTask: { updateMany: (a: unknown) => Promise<unknown> } }) => {
    const r = await tx.generation.updateMany({});
    if (r.count !== 1) return false;
    await tx.meetingTask.updateMany({});
    return true;
  },
  encolarPrimerPasoDeActa: async () => { enGlobal("encolar"); m.orden.push("encolar"); },
  avanzarActa: async () => { enGlobal("avanzar"); m.orden.push("avanzar"); },
  rescatarActaEnCurso: async () => { enGlobal("rescatar"); m.orden.push("rescatar"); return "g0"; },
}));
vi.mock("@/lib/meetings/acta-estado", () => ({ leerActa: (...a: unknown[]) => m.leer(...a) }));
vi.mock("@/lib/meetings/acceso", () => ({
  exigirVisible: async () => ({ ctx: { userId: "u1", demo: false } }),
  reunionDelUsuario: async () => ({ status: "lista" }),
}));
vi.mock("@/lib/meetings/almacen-blob", () => ({ almacenBlob: () => ({}) }));
vi.mock("@/lib/meetings/cola", () => ({ hayTrabajoSinAtender: async () => false }));
vi.mock("@/lib/meetings/demo-acta", () => ({ demoActa: vi.fn(), demoIniciarActa: vi.fn() }));
vi.mock("@/lib/meetings/empujon", () => ({ empujar: vi.fn() }));

import { POST } from "./route";

const pedir = (cuerpo: unknown = {}) =>
  POST(new Request("http://localhost/api/meetings/r1/acta", { method: "POST", body: JSON.stringify(cuerpo) }) as never, { params: Promise.resolve({ id: "r1" }) });

const CONTEXTO = { propertyId: "p1", fecha: new Date(), titulo: "T", ficha: null, duracionMs: 1000 };

beforeEach(() => {
  m.orden.length = 0;
  m.violaciones.length = 0;
  m.filas.length = 0;
  m.tx.abierta = false;
  m.tx.cola = Promise.resolve();
  m.rateLimit.mockReset().mockResolvedValue({ allowed: true });
  // El plan se mira con la conexión global y tarda un tick (deja que otras peticiones se cuelen, como en producción).
  m.usage.mockReset().mockImplementation(async () => {
    enGlobal("checkUsageLimits");
    const usadas = m.filas.length;
    await new Promise((r) => setTimeout(r, 0));
    return usadas < m.CUPO.max ? { allowed: true } : { allowed: false, reason: "Has alcanzado el límite diario de 3 generaciones." };
  });
  m.preparar.mockReset().mockResolvedValue({ ok: true, modo: "nueva", contexto: CONTEXTO });
  m.prepararReanudar.mockReset().mockResolvedValue({ ok: true });
  m.reanudado.mockReset().mockReturnValue(true);
  m.leer.mockReset().mockResolvedValue({ acta: { id: "g1" } });
  m.lock.mockReset();
  m.contarActas.mockReset().mockReturnValue(0);
});

describe("POST /api/meetings/[id]/acta: cupo sin carreras y sin retener el pool", () => {
  it("lo lento va ANTES del candado, solo los conteos y la fila DENTRO (con tx), y encolar DESPUÉS de confirmar", async () => {
    const r = await pedir();
    expect(r.status).toBe(201);
    expect(m.orden).toEqual(["preparar", "tx-abre", "candado", "tx-count", "tx-count", "tx-count", "tx-create", "tx-cierra", "encolar"]);
    expect(m.violaciones).toEqual([]);
    const plantilla = m.lock.mock.calls[0][0] as string[];
    expect(plantilla.join("?")).toContain("pg_advisory_xact_lock(hashtext(");
    expect(m.lock.mock.calls[0][1]).toBe("generate:u1"); // misma clave que generate/full
    expect(m.usage).toHaveBeenCalledWith("u1");
    expect(m.usage.mock.invocationCallOrder[0]).toBeLessThan(m.lock.mock.invocationCallOrder[0]);
  });

  it("frena la ráfaga con 429 y Retry-After, sin abrir transacción ni crear nada", async () => {
    m.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 17 });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("17");
    expect(m.rateLimit).toHaveBeenCalledWith("acta:u1", { max: 3, windowMs: 60_000 });
    expect(m.orden).toEqual([]);
    expect(m.filas).toHaveLength(0);
  });

  it("sin cupo en el plan: 429 con su mensaje, rechazado ANTES del candado (no retiene ninguna conexión)", async () => {
    m.usage.mockResolvedValue({ allowed: false, reason: "Has alcanzado el límite mensual de 15 generaciones." });
    const r = await pedir();
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe("Has alcanzado el límite mensual de 15 generaciones.");
    expect(m.orden).toEqual(["preparar"]);
    expect(m.filas).toHaveLength(0);
  });

  it("con el tope de actas en curso (de otras reuniones) responde 429 sin crear otra", async () => {
    m.contarActas.mockReturnValueOnce(0).mockReturnValueOnce(2);
    const r = await pedir();
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/redactándose/);
    expect(m.filas).toHaveLength(0);
    expect(m.orden).not.toContain("encolar");
    expect(m.violaciones).toEqual([]);
  });

  it("un doble clic con el acta ya en curso se contesta sin candado ni cupo (200)", async () => {
    m.preparar.mockResolvedValue({ ok: true, modo: "en_curso", generationId: "g0" });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).yaEnCurso).toBe(true);
    expect(m.orden).toEqual(["preparar"]);
    expect(m.usage).not.toHaveBeenCalled();
  });

  it("si el acta de ESTA reunión aparece mientras se espera el candado, no se crea otra: 200 y se rescata la existente", async () => {
    m.contarActas.mockReturnValueOnce(1);
    const r = await pedir();
    expect(r.status).toBe(200);
    expect((await r.json()).yaEnCurso).toBe(true);
    expect(m.filas).toHaveLength(0);
    expect(m.orden.at(-1)).toBe("rescatar");
    expect(m.violaciones).toEqual([]);
  });

  it("los motivos de la preparación (reunión no lista, sin transcripción, tope por reunión) salen con su código, sin candado", async () => {
    for (const [codigo, status] of [["no_existe", 404], ["no_lista", 409], ["sin_transcripcion", 409], ["sin_cupo", 429]] as const) {
      m.orden.length = 0;
      m.preparar.mockResolvedValue({ ok: false, codigo, error: `x ${codigo}` });
      const r = await pedir();
      expect(r.status).toBe(status);
      expect((await r.json()).error).toBe(`x ${codigo}`);
      expect(m.orden).toEqual(["preparar"]);
    }
  });

  it("reanudar también corre bajo el candado (solo con tx) y avanza el acta DESPUÉS de confirmar", async () => {
    const r = await pedir({ reanudar: "g0" });
    expect(r.status).toBe(200);
    expect(m.orden).toEqual(["tx-abre", "candado", "tx-count", "tx-count", "tx-count", "tx-reanudar-generacion", "tx-reanudar-tareas", "tx-cierra", "avanzar"]);
    expect(m.violaciones).toEqual([]);
    expect(m.prepararReanudar).toHaveBeenCalledWith("r1", "g0");
    expect(m.preparar).not.toHaveBeenCalled();
  });

  it("reanudar un acta que ya no está en error (otro clic la retomó): 409, sin avanzar", async () => {
    m.reanudado.mockReturnValue(false);
    const r = await pedir({ reanudar: "g0" });
    expect(r.status).toBe(409);
    expect(m.orden).not.toContain("avanzar");
  });

  it("reanudar un acta que no está en error se descarta antes del candado (409)", async () => {
    m.prepararReanudar.mockResolvedValue({ ok: false, codigo: "no_en_error", error: "Esta acta no está en error." });
    const r = await pedir({ reanudar: "g0" });
    expect(r.status).toBe(409);
    expect(m.orden).toEqual([]);
  });

  it("si encolar falla tras confirmar, la fila ya existe y la respuesta sigue siendo 201 (el cron la rescata)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const orq = await import("@/lib/meetings/acta-orquestador");
    vi.spyOn(orq, "encolarPrimerPasoDeActa").mockRejectedValueOnce(new Error("cola caída"));
    const r = await pedir();
    expect(r.status).toBe(201);
    expect(m.filas).toHaveLength(1);
  });

  it("ráfaga: 10 peticiones simultáneas dejan pasar exactamente el cupo del plan (3), nunca usan la conexión global dentro del candado", async () => {
    const respuestas = await Promise.all(Array.from({ length: 10 }, () => pedir()));
    const estados = respuestas.map((r) => r.status);
    expect(estados.filter((s) => s === 201)).toHaveLength(m.CUPO.max);
    expect(m.filas).toHaveLength(m.CUPO.max);
    // Las demás se rechazan con 429 (plan agotado o reintento agotado), nunca con un error ni un cupo de más.
    expect(estados.filter((s) => s !== 201).every((s) => s === 429)).toBe(true);
    expect(m.violaciones).toEqual([]);
  });

  it("si otra generación se cuela entre mirar el plan y tomar el candado, el plan se vuelve a mirar (no se da un cupo viejo)", async () => {
    m.CUPO.max = 1;
    try {
      const [a, b] = await Promise.all([pedir(), pedir()]);
      expect([a.status, b.status].sort()).toEqual([201, 429]);
      expect(m.filas).toHaveLength(1);
      expect(m.usage.mock.calls.length).toBeGreaterThanOrEqual(3); // la perdedora lo mira otra vez
    } finally {
      m.CUPO.max = 3;
    }
  });
});
