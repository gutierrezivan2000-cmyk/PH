import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("next-auth/react", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));

import { idDeUsuarioActual, rutaDeSubidaActual } from "./blob-owner-client";
import { blobPerteneceA } from "./blob-owner";

beforeEach(() => {
  getSession.mockReset();
});

describe("idDeUsuarioActual", () => {
  it("usa el id conocido sin pedir la sesión", async () => {
    expect(await idDeUsuarioActual("u1")).toBe("u1");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("si no hay id conocido, lo pide a la sesión", async () => {
    getSession.mockResolvedValue({ user: { id: "u2" } });
    expect(await idDeUsuarioActual()).toBe("u2");
    expect(await idDeUsuarioActual(null)).toBe("u2");
    expect(await idDeUsuarioActual("")).toBe("u2");
  });

  it("sin sesión (o si la petición falla) lanza un mensaje claro en español", async () => {
    getSession.mockResolvedValue(null);
    await expect(idDeUsuarioActual()).rejects.toThrow(/No se pudo identificar tu sesión/);
    getSession.mockRejectedValue(new Error("red"));
    await expect(idDeUsuarioActual()).rejects.toThrow(/No se pudo identificar tu sesión/);
    getSession.mockResolvedValue({ user: {} });
    await expect(idDeUsuarioActual()).rejects.toThrow(/No se pudo identificar tu sesión/);
  });
});

describe("rutaDeSubidaActual", () => {
  it("construye la ruta del usuario de la sesión", async () => {
    getSession.mockResolvedValue({ user: { id: "u2" } });
    const ruta = await rutaDeSubidaActual("acta.pdf", "uploads");
    expect(blobPerteneceA(ruta, "u2")).toBe(true);
    expect(ruta.startsWith("subidas/u2/uploads/acta-")).toBe(true);
  });

  it("con el id conocido no consulta la sesión (ciclos de archivos)", async () => {
    const ruta = await rutaDeSubidaActual("acta.pdf", "uploads", "u1");
    expect(blobPerteneceA(ruta, "u1")).toBe(true);
    expect(getSession).not.toHaveBeenCalled();
  });
});
