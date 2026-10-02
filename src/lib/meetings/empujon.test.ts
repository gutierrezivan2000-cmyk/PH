import { beforeEach, describe, expect, it, vi } from "vitest";

const { after, trabajar } = vi.hoisted(() => ({ after: vi.fn(), trabajar: vi.fn() }));
vi.mock("next/server", () => ({ after: (...a: unknown[]) => after(...a) }));
vi.mock("./trabajador", () => ({ trabajar: (...a: unknown[]) => trabajar(...a) }));

import { PRESUPUESTO_EMPUJON_MS, empujar } from "./empujon";

beforeEach(() => {
  after.mockReset();
  trabajar.mockReset();
  trabajar.mockResolvedValue({ ejecutadas: 0, fallidas: 0, continuadas: 0 });
});

describe("empujar", () => {
  it("deja el trabajo para cuando ya se respondió (after) y no lo ejecuta de inmediato", () => {
    empujar();
    expect(after).toHaveBeenCalledTimes(1);
    expect(trabajar).not.toHaveBeenCalled();
  });

  it("cuando after lo ejecuta, trabaja con el presupuesto de una ruta (230 s por defecto)", async () => {
    empujar();
    await after.mock.calls[0][0]();
    expect(trabajar).toHaveBeenCalledWith({ presupuestoMs: PRESUPUESTO_EMPUJON_MS });
    expect(PRESUPUESTO_EMPUJON_MS).toBe(230_000);
    after.mockReset();
    empujar(60_000);
    await after.mock.calls[0][0]();
    expect(trabajar).toHaveBeenLastCalledWith({ presupuestoMs: 60_000 });
  });

  it("un fallo del trabajo no se propaga (la ruta ya respondió) y queda en el registro", async () => {
    trabajar.mockRejectedValue(new Error("se cayó"));
    const registro = vi.spyOn(console, "error").mockImplementation(() => {});
    empujar();
    await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
    expect(registro).toHaveBeenCalled();
    registro.mockRestore();
  });

  it("fuera de una petición (after no existe) se ejecuta directo, sin romper a quien llama", async () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    expect(() => empujar()).not.toThrow();
    await Promise.resolve();
    expect(trabajar).toHaveBeenCalledTimes(1);
  });
});
