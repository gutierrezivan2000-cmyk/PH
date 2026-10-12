import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ generation: { count: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

import { PLANS } from "@/lib/epayco";
import { cupoMensualRestante, generacionesDelMes, inicioDeMesBogota, topeMensualElite } from "./cupo-lote";

beforeEach(() => db.generation.count.mockReset());

describe("inicio de mes en Bogotá", () => {
  it("es el primer instante del mes en UTC-5 (las 05:00 UTC del día 1)", () => {
    expect(inicioDeMesBogota(new Date("2026-10-15T15:00:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
  it("a las 02:00 UTC del día 1 en Bogotá todavía es el mes anterior (21:00 del último día)", () => {
    expect(inicioDeMesBogota(new Date("2026-10-01T02:00:00Z")).toISOString()).toBe("2026-09-01T05:00:00.000Z");
  });
  it("justo a las 05:00 UTC del día 1 ya empezó el mes nuevo", () => {
    expect(inicioDeMesBogota(new Date("2026-10-01T05:00:00Z")).toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });
  it("cambia de año bien", () => {
    expect(inicioDeMesBogota(new Date("2027-01-01T03:00:00Z")).toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("cupo mensual del lote", () => {
  const desde = new Date("2026-10-01T05:00:00Z");
  it("el tope es el del plan Élite", () => expect(topeMensualElite()).toBe(PLANS.elite.limits.generationsPerMonth));

  it("cuenta solo completadas, en proceso y pendientes del usuario desde el inicio del mes (las fallidas no)", async () => {
    db.generation.count.mockResolvedValue(7);
    expect(await generacionesDelMes("u1", desde)).toBe(7);
    expect(db.generation.count).toHaveBeenCalledWith({
      where: { userId: "u1", createdAt: { gte: desde }, status: { in: ["completed", "processing", "pending"] } },
    });
  });

  it("el cupo restante es el tope menos lo gastado, sin bajar de cero", async () => {
    db.generation.count.mockResolvedValue(topeMensualElite() - 4);
    expect(await cupoMensualRestante("u1", desde)).toBe(4);
    db.generation.count.mockResolvedValue(topeMensualElite() + 30);
    expect(await cupoMensualRestante("u1", desde)).toBe(0);
  });
});
