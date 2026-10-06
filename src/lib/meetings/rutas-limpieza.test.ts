/**
 * El cron de la retención: solo con el secreto, con su tope de tiempo, sin detalles internos al fallar, y registrado en vercel.json
 * (una ruta de cron que no está ahí no corre nunca).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limpiar, esquema, almacen } = vi.hoisted(() => ({ limpiar: vi.fn(), esquema: vi.fn(), almacen: { borrar: async () => {} } }));
vi.mock("@/lib/ensure-meetings-schema", () => ({ ensureMeetingsSchema: (...a: unknown[]) => esquema(...a) }));
vi.mock("@/lib/meetings/retencion", () => ({ limpiarReuniones: (...a: unknown[]) => limpiar(...a) }));
vi.mock("@/lib/meetings/almacen-blob", () => ({ almacenBlob: () => almacen }));

import { GET as limpieza } from "@/app/api/cron/cleanup-meetings/route";

const RESUMEN = { originales: 3, sesiones: 1, partes: 40, bytesLiberados: 12_345, omitidas: 0, errores: 0, pendiente: false };
const pedir = (cabeceras: Record<string, string> = {}) => new NextRequest("http://localhost/api/cron/cleanup-meetings", { headers: cabeceras });

beforeEach(() => {
  limpiar.mockReset();
  esquema.mockReset();
  limpiar.mockResolvedValue(RESUMEN);
  vi.stubEnv("CRON_SECRET", "secreto-de-prueba");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("GET /api/cron/cleanup-meetings", () => {
  it("sin el secreto correcto: 401, y no limpia nada", async () => {
    expect((await limpieza(pedir())).status).toBe(401);
    expect((await limpieza(pedir({ authorization: "Bearer otro" }))).status).toBe(401);
    expect((await limpieza(pedir({ authorization: "secreto-de-prueba" }))).status).toBe(401);
    expect(limpiar).not.toHaveBeenCalled();
  });

  it("sin CRON_SECRET configurado: 401, nunca abierto", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await limpieza(pedir({ authorization: "Bearer " }))).status).toBe(401);
    expect((await limpieza(pedir({ authorization: "Bearer undefined" }))).status).toBe(401);
    expect(limpiar).not.toHaveBeenCalled();
  });

  it("con el secreto: prepara el esquema, limpia con el almacén de verdad y un tope de tiempo, y devuelve el resumen", async () => {
    const r = await limpieza(pedir({ authorization: "Bearer secreto-de-prueba" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, ...RESUMEN });
    expect(esquema).toHaveBeenCalledTimes(1);
    expect(limpiar).toHaveBeenCalledTimes(1);
    const args = limpiar.mock.calls[0][0] as { almacen: unknown; presupuestoMs: number };
    expect(args.almacen).toBe(almacen);
    expect(args.presupuestoMs).toBeGreaterThan(0);
    expect(args.presupuestoMs).toBeLessThan(300_000); // cabe dentro de la duración máxima de la ruta
  });

  it("si la limpieza falla: 500 sin detalles internos, y queda en el registro", async () => {
    limpiar.mockRejectedValue(new Error("conexión rota: postgres://usuario:clave@host"));
    const r = await limpieza(pedir({ authorization: "Bearer secreto-de-prueba" }));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/postgres|clave/);
    expect(console.error).toHaveBeenCalled();
  });

  it("si no se puede preparar el esquema, tampoco limpia", async () => {
    esquema.mockRejectedValue(new Error("sin base de datos"));
    expect((await limpieza(pedir({ authorization: "Bearer secreto-de-prueba" }))).status).toBe(500);
    expect(limpiar).not.toHaveBeenCalled();
  });
});

describe("vercel.json", () => {
  const crons = (JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as { crons: Array<{ path: string; schedule: string }> }).crons;

  it("la limpieza de reuniones corre una vez al día", () => {
    expect(crons).toContainEqual({ path: "/api/cron/cleanup-meetings", schedule: "17 4 * * *" });
  });

  it("toda ruta de cron tiene su entrada (si no, nunca corre) y toda entrada tiene su ruta", () => {
    const raiz = join(process.cwd(), "src/app/api/cron");
    const rutas = readdirSync(raiz).filter((d) => statSync(join(raiz, d)).isDirectory() && statSync(join(raiz, d, "route.ts")).isFile()).map((d) => `/api/cron/${d}`);
    expect(crons.map((c) => c.path).sort()).toEqual(rutas.sort());
  });
});
