import { describe, it, expect, beforeAll } from "vitest";
import { firmarDescarga, verificarDescarga } from "./agent-file-token";

const BASE = {
  url: "https://abc.blob.vercel-storage.com/agent-files/u1/presupuesto.xlsx",
  nombre: "presupuesto.xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

beforeAll(() => {
  process.env.AUTH_SECRET = "secreto-de-prueba-para-firmar";
});

describe("permiso de descarga firmado", () => {
  it("el dueño puede descargar", () => {
    const t = firmarDescarga({ ...BASE, userId: "u1" });
    const p = verificarDescarga(t, "u1");
    expect(p?.url).toBe(BASE.url);
    expect(p?.nombre).toBe("presupuesto.xlsx");
  });

  it("otro usuario con el mismo enlace NO puede", () => {
    // Es el punto del diseño: el enlace se puede compartir por error y no sirve.
    const t = firmarDescarga({ ...BASE, userId: "u1" });
    expect(verificarDescarga(t, "u2")).toBeNull();
  });

  it("un enlace manipulado no pasa", () => {
    const t = firmarDescarga({ ...BASE, userId: "u1" });
    const [payload, mac] = t.split(".");
    const otro = Buffer.from(
      JSON.stringify({ ...BASE, userId: "u2", exp: Date.now() + 10000 })
    ).toString("base64url");
    expect(verificarDescarga(`${otro}.${mac}`, "u2")).toBeNull();
    expect(verificarDescarga(`${payload}.firmafalsa`, "u1")).toBeNull();
  });

  it("caduca", () => {
    const t = firmarDescarga({ ...BASE, userId: "u1" });
    const [payload] = t.split(".");
    const vencido = JSON.parse(Buffer.from(payload, "base64url").toString());
    vencido.exp = Date.now() - 1000;
    const p2 = Buffer.from(JSON.stringify(vencido)).toString("base64url");
    expect(verificarDescarga(`${p2}.${firmarDescarga({ ...BASE, userId: "u1" }).split(".")[1]}`, "u1")).toBeNull();
  });

  it("aguanta basura sin lanzar", () => {
    for (const t of ["", "sinpunto", "a.b", "....", "x".repeat(500)]) {
      expect(() => verificarDescarga(t, "u1")).not.toThrow();
      expect(verificarDescarga(t, "u1")).toBeNull();
    }
  });
});
