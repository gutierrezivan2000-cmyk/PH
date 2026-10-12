import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const db = vi.hoisted(() => ({
  certificate: { findUnique: vi.fn() },
  // Para el limitador real (rate-limit.ts), que cuenta con $queryRaw y limpia contadores viejos con deleteMany.
  $queryRaw: vi.fn(),
  rateLimit: { deleteMany: vi.fn() },
}));
const limite = vi.hoisted(() => ({ rateLimit: vi.fn() }));
const peticion = vi.hoisted(() => ({ cabeceras: {} as Record<string, string> }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/ensure-admin-schema", () => ({ ensureAdminSchema: async () => {} }));
vi.mock("@/lib/rate-limit", () => limite);
vi.mock("next/headers", () => ({ headers: async () => new Headers(peticion.cabeceras) }));

import VerificarPage from "./page";

const CODIGO = "ABCD1234efgh";
const LIMITADO = "Demasiadas consultas. Intenta en unos minutos";

const certificado = {
  type: "paz_y_salvo",
  recipientName: "Ana Pérez",
  unitLabel: "Apto 502",
  status: "valid",
  createdAt: new Date("2026-10-01T12:00:00Z"),
  revokedAt: null,
  meta: { validUntil: "2099-12-31" },
  property: { name: "Los Pinos", city: "Bogotá" },
};

/** Renderiza la página a HTML estático: lo que vería quien escanea el QR. */
async function pagina(code = CODIGO): Promise<string> {
  return renderToStaticMarkup(await VerificarPage({ params: Promise.resolve({ code }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DEMO_MODE", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  peticion.cabeceras = { "x-forwarded-for": "198.51.100.7, 203.0.113.50" };
  limite.rateLimit.mockResolvedValue({ allowed: true });
  db.certificate.findUnique.mockResolvedValue(certificado);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/verificar/[code] — límite por IP con failClosed", () => {
  it("pide el contador de la IP (el ÚLTIMO valor de x-forwarded-for) con failClosed:true, 60 cada 10 minutos", async () => {
    await pagina();
    expect(limite.rateLimit).toHaveBeenCalledTimes(1);
    expect(limite.rateLimit).toHaveBeenCalledWith("verificar:203.0.113.50", { max: 60, windowMs: 10 * 60 * 1000, failClosed: true });
  });

  it("con el contador libre consulta el certificado y lo muestra", async () => {
    const html = await pagina();
    expect(db.certificate.findUnique).toHaveBeenCalledTimes(1);
    expect(html).toContain("Documento auténtico y vigente");
    expect(html).not.toContain(LIMITADO);
  });

  it("con el límite alcanzado muestra «Demasiadas consultas» y no consulta el certificado", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 300 });
    const html = await pagina();
    expect(html).toContain(LIMITADO);
    // No se dice que el certificado sea falso: simplemente no se pudo consultar.
    expect(html).toContain("Esto no significa que sea falso");
    expect(html).not.toContain("no debe considerarse");
    expect(db.certificate.findUnique).not.toHaveBeenCalled();
  });

  it("si el límite no se pudo contar (unavailable) muestra la misma pantalla y no consulta el certificado", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30, unavailable: true });
    const html = await pagina();
    expect(html).toContain(LIMITADO);
    expect(db.certificate.findUnique).not.toHaveBeenCalled();
  });

  it("si la base falla al contar, el limitador REAL deniega: «Demasiadas consultas» y ninguna consulta de certificado", async () => {
    const real = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
    limite.rateLimit.mockImplementation(real.rateLimit);
    db.$queryRaw.mockRejectedValue(new Error("la base no responde"));

    const html = await pagina();

    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(html).toContain(LIMITADO);
    expect(db.certificate.findUnique).not.toHaveBeenCalled();
  });

  it("un código mal formado no toca la base y se muestra como no encontrado", async () => {
    const html = await pagina("corto");
    expect(html).toContain("Documento no encontrado");
    expect(db.certificate.findUnique).not.toHaveBeenCalled();
  });

  it("en modo demo no cuenta ni consulta nada", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    const html = await pagina();
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(db.certificate.findUnique).not.toHaveBeenCalled();
    expect(html).toContain("Documento no encontrado");
  });
});
