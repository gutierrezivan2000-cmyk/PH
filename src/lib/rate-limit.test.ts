import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $queryRawUnsafe: vi.fn(),
  $executeRawUnsafe: vi.fn(),
  rateLimit: { deleteMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

import { clientIp, rateLimit } from "./rate-limit";

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

/** SQL (con "?" donde iría cada parámetro) y valores enlazados de la última llamada a $queryRaw. */
function ultimaConsulta() {
  const llamadas = db.$queryRaw.mock.calls;
  const [strings, ...values] = llamadas[llamadas.length - 1] as [TemplateStringsArray, ...unknown[]];
  return { sql: Array.from(strings).join("?"), values };
}

/**
 * Base en memoria que aplica lo que hace la sentencia SQL, leyendo los valores
 * por la posición en que rateLimit los enlaza: [id, key, ventana, max, ventana, ventana].
 * Sirve para probar ventanas, topes y reinicio sin un Postgres.
 */
function simularBase() {
  const filas = new Map<string, { count: number; windowStartMs: number }>();
  db.$queryRaw.mockImplementation(async (_s: TemplateStringsArray, ...v: unknown[]) => {
    const [, key, ventanaMs, max] = v as [string, string, number, number];
    const ahora = Date.now();
    const previa = filas.get(key);
    const fila =
      !previa || previa.windowStartMs <= ahora - ventanaMs
        ? { count: 1, windowStartMs: ahora }
        : { count: Math.min(previa.count, max) + 1, windowStartMs: previa.windowStartMs };
    filas.set(key, fila);
    return [{ count: fila.count, resetInSec: Math.ceil((fila.windowStartMs + ventanaMs - ahora) / 1000) }];
  });
  return filas;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Por omisión la limpieza oportunista no se dispara (1 % de las llamadas).
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  db.rateLimit.deleteMany.mockResolvedValue({ count: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("rateLimit — una sola sentencia atómica y parametrizada", () => {
  it("cuenta con un único INSERT ... ON CONFLICT DO UPDATE ... RETURNING", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1, resetInSec: 900 }]);
    await rateLimit("login:email:ana@x.co", { max: 10, windowMs: 15 * MINUTO });

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    const { sql } = ultimaConsulta();
    expect(sql).toMatch(/INSERT INTO "RateLimit" \("id", "key", "count", "windowStart"\)/);
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO UPDATE SET/);
    // Ventana vencida → el contador vuelve a 1 y la ventana empieza ahora; si no, suma 1.
    expect(sql).toMatch(/"count" = CASE\s+WHEN "RateLimit"\."windowStart" <= .*\s+THEN 1\s+ELSE LEAST\("RateLimit"\."count", \?::int\) \+ 1\s+END/);
    expect(sql).toMatch(/"windowStart" = CASE\s+WHEN "RateLimit"\."windowStart" <= .*\s+THEN \(NOW\(\) AT TIME ZONE 'UTC'\)\s+ELSE "RateLimit"\."windowStart"\s+END/);
    expect(sql).toMatch(/RETURNING\s+"count",/);
    // Ya no hay lectura previa ni escrituras sueltas (eso era lo que no era atómico).
    expect(db.rateLimit.deleteMany).not.toHaveBeenCalled();
  });

  it("clave, máximo y ventana van como parámetros enlazados, no dentro del SQL", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1, resetInSec: 900 }]);
    await rateLimit("login:email:ana@x.co", { max: 7, windowMs: 900_000 });

    const { sql, values } = ultimaConsulta();
    expect(sql).not.toContain("ana@x.co");
    expect(sql).not.toContain("login:email");
    expect(sql).not.toContain("900000");
    // Un parámetro entre comillas ('?') sería un texto literal, no un valor enlazado.
    expect(sql).not.toMatch(/'\?'/);
    expect(values).toContain("login:email:ana@x.co");
    expect(values).toContain(7);
    // La ventana se usa tres veces en la sentencia (contador, inicio y retryAfter).
    expect(values.filter((v) => v === 900_000)).toHaveLength(3);
    // id propio, porque la columna no tiene valor por omisión en la base.
    expect(values[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("una clave con comillas o SQL queda como dato, nunca como parte de la consulta", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1, resetInSec: 60 }]);
    const maliciosa = `x'; DROP TABLE "RateLimit"; --`;
    await rateLimit(maliciosa, { max: 5, windowMs: MINUTO });

    const { sql, values } = ultimaConsulta();
    expect(sql).not.toContain("DROP TABLE");
    expect(values).toContain(maliciosa);
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});

describe("rateLimit — límites", () => {
  it("la petición número max se permite; la max + 1 se deniega", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: 3, resetInSec: 40 }]);
    expect(await rateLimit("k:a", { max: 3, windowMs: MINUTO })).toEqual({ allowed: true });

    db.$queryRaw.mockResolvedValueOnce([{ count: 4, resetInSec: 40 }]);
    expect(await rateLimit("k:a", { max: 3, windowMs: MINUTO })).toEqual({ allowed: false, retryAfterSec: 40 });
  });

  it("con max 1 la primera pasa y la segunda no", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: 1, resetInSec: 60 }]);
    expect((await rateLimit("k:b", { max: 1, windowMs: MINUTO })).allowed).toBe(true);
    db.$queryRaw.mockResolvedValueOnce([{ count: 2, resetInSec: 59 }]);
    expect((await rateLimit("k:b", { max: 1, windowMs: MINUTO })).allowed).toBe(false);
  });

  it("retryAfterSec nunca baja de 1 segundo ni es NaN", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: 9, resetInSec: 0 }]);
    expect((await rateLimit("k:c", { max: 3, windowMs: MINUTO })).retryAfterSec).toBe(1);
    db.$queryRaw.mockResolvedValueOnce([{ count: 9, resetInSec: null }]);
    expect((await rateLimit("k:c", { max: 3, windowMs: MINUTO })).retryAfterSec).toBe(1);
  });

  it("acepta el conteo como bigint o texto (según el controlador)", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: BigInt(4), resetInSec: BigInt(12) }]);
    expect(await rateLimit("k:d", { max: 3, windowMs: MINUTO })).toEqual({ allowed: false, retryAfterSec: 12 });
    db.$queryRaw.mockResolvedValueOnce([{ count: "3", resetInSec: "12" }]);
    expect(await rateLimit("k:d", { max: 3, windowMs: MINUTO })).toEqual({ allowed: true });
  });

  it("al permitir no devuelve retryAfterSec (misma forma que antes)", async () => {
    db.$queryRaw.mockResolvedValue([{ count: 1, resetInSec: 60 }]);
    const r = await rateLimit("k:e", { max: 3, windowMs: MINUTO });
    expect(r).toEqual({ allowed: true });
    expect("retryAfterSec" in r).toBe(false);
  });
});

describe("rateLimit — ventana fija (con la base simulada)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  it("permite exactamente max y deniega el resto de la ventana", async () => {
    simularBase();
    const resultados = [];
    for (let i = 0; i < 6; i++) resultados.push((await rateLimit("k:f", { max: 3, windowMs: MINUTO })).allowed);
    expect(resultados).toEqual([true, true, true, false, false, false]);
  });

  it("peticiones simultáneas: solo max pasan", async () => {
    simularBase();
    const rs = await Promise.all(Array.from({ length: 25 }, () => rateLimit("k:g", { max: 5, windowMs: MINUTO })));
    expect(rs.filter((r) => r.allowed)).toHaveLength(5);
    expect(rs.filter((r) => !r.allowed)).toHaveLength(20);
  });

  it("la ventana se reinicia al vencer y el contador vuelve a empezar", async () => {
    const filas = simularBase();
    for (let i = 0; i < 3; i++) await rateLimit("k:h", { max: 2, windowMs: MINUTO });
    expect((await rateLimit("k:h", { max: 2, windowMs: MINUTO })).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T12:01:00.000Z")); // justo al vencer la ventana
    expect((await rateLimit("k:h", { max: 2, windowMs: MINUTO })).allowed).toBe(true);
    expect(filas.get("k:h")!.count).toBe(1);
    expect((await rateLimit("k:h", { max: 2, windowMs: MINUTO })).allowed).toBe(true);
    expect((await rateLimit("k:h", { max: 2, windowMs: MINUTO })).allowed).toBe(false);
  });

  it("denegar no extiende la ventana: antes de vencer sigue negado, al vencer se libera", async () => {
    simularBase();
    await rateLimit("k:i", { max: 1, windowMs: MINUTO });
    vi.setSystemTime(new Date("2026-01-01T12:00:59.999Z"));
    const casi = await rateLimit("k:i", { max: 1, windowMs: MINUTO });
    expect(casi.allowed).toBe(false);
    expect(casi.retryAfterSec).toBe(1);

    vi.setSystemTime(new Date("2026-01-01T12:01:00.000Z"));
    expect((await rateLimit("k:i", { max: 1, windowMs: MINUTO })).allowed).toBe(true);
  });

  it("retryAfterSec baja a medida que pasa la ventana", async () => {
    simularBase();
    await rateLimit("k:j", { max: 1, windowMs: 10 * MINUTO });
    const a = await rateLimit("k:j", { max: 1, windowMs: 10 * MINUTO });
    vi.setSystemTime(new Date("2026-01-01T12:04:00.000Z"));
    const b = await rateLimit("k:j", { max: 1, windowMs: 10 * MINUTO });
    expect(a.retryAfterSec).toBe(600);
    expect(b.retryAfterSec).toBe(360);
  });

  it("las claves no se mezclan entre sí", async () => {
    simularBase();
    await rateLimit("k:uno", { max: 1, windowMs: MINUTO });
    expect((await rateLimit("k:uno", { max: 1, windowMs: MINUTO })).allowed).toBe(false);
    expect((await rateLimit("k:dos", { max: 1, windowMs: MINUTO })).allowed).toBe(true);
  });
});

describe("rateLimit — falla de la base de datos", () => {
  let logError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logError = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
  });

  it("por omisión falla ABIERTO: deja pasar", async () => {
    expect(await rateLimit("k:k", { max: 3, windowMs: MINUTO })).toEqual({ allowed: true });
  });

  it("failClosed: false explícito también deja pasar", async () => {
    expect(await rateLimit("k:k", { max: 3, windowMs: MINUTO, failClosed: false })).toEqual({ allowed: true });
  });

  it("failClosed: true deniega y marca que fue por la base, no por el límite", async () => {
    const r = await rateLimit("k:k", { max: 3, windowMs: MINUTO, failClosed: true });
    expect(r.allowed).toBe(false);
    expect(r.unavailable).toBe(true);
    expect(r.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("registra UNA línea por falla y sin la clave (lleva correos, IPs o tokens)", async () => {
    await rateLimit("login:email:ana@x.co", { max: 3, windowMs: MINUTO });
    expect(logError).toHaveBeenCalledTimes(1);
    const texto = logError.mock.calls[0].map(String).join(" ");
    expect(texto).toContain("[rateLimit]");
    expect(texto).toContain("login");
    expect(texto).not.toContain("ana@x.co");
  });

  it("indica en el log si denegó o dejó pasar", async () => {
    await rateLimit("verify:ana@x.co", { max: 3, windowMs: MINUTO, failClosed: true });
    await rateLimit("verify:ana@x.co", { max: 3, windowMs: MINUTO });
    expect(String(logError.mock.calls[0][0])).toContain("failClosed");
    expect(String(logError.mock.calls[1][0])).toContain("fail-open");
  });

  it("una respuesta sin filas se trata como falla (no como permiso silencioso)", async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect((await rateLimit("k:l", { max: 3, windowMs: MINUTO })).allowed).toBe(true);
    expect((await rateLimit("k:l", { max: 3, windowMs: MINUTO, failClosed: true })).allowed).toBe(false);
    expect(logError).toHaveBeenCalledTimes(2);
  });

  it("un error que no es Error tampoco rompe el registro", async () => {
    db.$queryRaw.mockRejectedValue("boom");
    expect((await rateLimit("k:m", { max: 3, windowMs: MINUTO, failClosed: true })).allowed).toBe(false);
  });

  it("si la base falla no intenta limpiar", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    await rateLimit("k:n", { max: 3, windowMs: MINUTO });
    expect(db.rateLimit.deleteMany).not.toHaveBeenCalled();
  });
});

describe("rateLimit — limpieza oportunista de contadores viejos", () => {
  beforeEach(() => {
    db.$queryRaw.mockResolvedValue([{ count: 1, resetInSec: 60 }]);
  });

  it("casi nunca: con el azar en 0,5 no borra nada", async () => {
    await rateLimit("k:o", { max: 3, windowMs: MINUTO });
    expect(db.rateLimit.deleteMany).not.toHaveBeenCalled();
  });

  it("~1 % de las llamadas borra lo vencido hace más de 7 días", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValue(0.0099);

    await rateLimit("k:p", { max: 3, windowMs: MINUTO });

    expect(db.rateLimit.deleteMany).toHaveBeenCalledTimes(1);
    const { where } = db.rateLimit.deleteMany.mock.calls[0][0];
    const [cortas, mensuales] = where.OR;
    expect(cortas.windowStart.lt).toEqual(new Date(Date.now() - 7 * DIA));
    // Los contadores mensuales de correos NO entran en la purga de 7 días.
    expect(cortas.NOT).toEqual({ key: { startsWith: "emails:" } });
    // Se purgan aparte, pasados ~40 días.
    expect(mensuales.key).toEqual({ startsWith: "emails:" });
    expect(mensuales.windowStart.lt).toEqual(new Date(Date.now() - 40 * DIA));
  });

  it("el borde del 1 % no dispara la limpieza", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    await rateLimit("k:q", { max: 3, windowMs: MINUTO });
    expect(db.rateLimit.deleteMany).not.toHaveBeenCalled();
  });

  it("no espera la limpieza: responde aunque el borrado nunca termine", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    db.rateLimit.deleteMany.mockReturnValue(new Promise(() => {}));
    expect(await rateLimit("k:r", { max: 3, windowMs: MINUTO })).toEqual({ allowed: true });
  });

  it("si el borrado falla (promesa rechazada) el resultado no cambia", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    db.rateLimit.deleteMany.mockRejectedValue(new Error("deadlock"));
    expect(await rateLimit("k:s", { max: 3, windowMs: MINUTO })).toEqual({ allowed: true });
    await Promise.resolve(); // deja correr el .catch sin que quede un rechazo sin atender
  });

  it("si el borrado lanza de forma síncrona el resultado tampoco cambia", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    db.rateLimit.deleteMany.mockImplementation(() => {
      throw new Error("[demo] db.rateLimit.deleteMany()");
    });
    expect(await rateLimit("k:t", { max: 3, windowMs: MINUTO })).toEqual({ allowed: true });
  });

  it("también limpia cuando la petición se deniega", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    db.$queryRaw.mockResolvedValue([{ count: 4, resetInSec: 10 }]);
    expect((await rateLimit("k:u", { max: 3, windowMs: MINUTO })).allowed).toBe(false);
    expect(db.rateLimit.deleteMany).toHaveBeenCalledTimes(1);
  });
});

describe("clientIp", () => {
  const req = (headers: Record<string, string>) =>
    ({ headers: { get: (n: string) => headers[n] ?? null } }) as unknown as NextRequest;

  it("prefiere x-real-ip sobre x-forwarded-for", () => {
    expect(clientIp(req({ "x-real-ip": " 1.2.3.4 ", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
  });
  it("sin x-real-ip usa el primer valor de x-forwarded-for", () => {
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }))).toBe("9.9.9.9");
  });
  it("sin cabeceras devuelve «unknown»", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
