import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, acceso, parseFile, generateWithClaude } = vi.hoisted(() => ({
  db: { property: { findFirst: vi.fn() } },
  acceso: { allowed: true },
  parseFile: vi.fn(),
  generateWithClaude: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "u1" } }) }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/usage", () => ({ checkSubscriptionAccess: async () => ({ allowed: acceso.allowed, status: "x" }) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/consumo/registrar", () => ({ conConsumo: async (_o: unknown, fn: () => unknown) => fn() }));
vi.mock("@/lib/parsers", () => ({ detectFileType: () => "text", parseFile }));
vi.mock("@/lib/ai-client", () => ({ generateWithClaude }));

import { POST } from "./route";

const llamar = () => {
  const form = new FormData();
  form.set("file", new File(["Apto 101, Maria"], "unidades.csv", { type: "text/csv" }));
  return POST({ formData: async () => form } as never, { params: Promise.resolve({ propertyId: "p1" }) });
};

beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.spyOn(console, "error").mockImplementation(() => {});
  acceso.allowed = true;
  db.property.findFirst.mockReset().mockResolvedValue({ id: "p1" });
  parseFile.mockReset().mockResolvedValue({ text: "Apto 101, Maria Perez, 1.2" });
  generateWithClaude.mockReset().mockResolvedValue({ text: '[{"label":"Apto 101","residentName":"Maria"}]' });
});

describe("POST units/import", () => {
  it("sin prueba ni plan activo: 403 y no se consume IA", async () => {
    acceso.allowed = false;
    const r = await llamar();
    expect(r.status).toBe(403);
    expect(db.property.findFirst).not.toHaveBeenCalled();
    expect(parseFile).not.toHaveBeenCalled();
    expect(generateWithClaude).not.toHaveBeenCalled();
  });

  it("con acceso activo: importa normalmente", async () => {
    const r = await llamar();
    expect(r.status).toBe(200);
    expect((await r.json()).units).toHaveLength(1);
  });

  it("un error interno (credenciales de BD) no se filtra al usuario", async () => {
    db.property.findFirst.mockRejectedValue(
      new Error("Authentication failed against database server, the provided database credentials are not valid")
    );
    const r = await llamar();
    expect(r.status).toBe(500);
    const { error } = await r.json();
    expect(error).toBe("No se pudo procesar el archivo. Intenta de nuevo.");
  });

  it("un error de IA conocido sí se muestra", async () => {
    parseFile.mockRejectedValue(new Error("El servicio de IA esta temporalmente saturado. Intenta de nuevo en unos minutos."));
    const r = await llamar();
    expect(r.status).toBe(500);
    expect((await r.json()).error).toMatch(/saturado/);
  });

  it("fallo del modelo sin filas: 503 genérico si el mensaje no es de IA", async () => {
    generateWithClaude.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 credentials"));
    const r = await llamar();
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("El servicio de IA no pudo leer el archivo. Intenta de nuevo.");
  });
});
