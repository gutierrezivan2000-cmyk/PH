import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const limite = vi.hoisted(() => ({ rateLimit: vi.fn(), clientIp: vi.fn() }));
vi.mock("@/lib/rate-limit", () => limite);

import { POST } from "./route";

const INFORME_URI = JSON.stringify({
  "csp-report": {
    "document-uri": "https://app.ejemplo.com/u/TOKEN-SECRETO?x=1#frag",
    "blocked-uri": "https://fonts.ejemplo.com/f.woff2?k=SECRETO#parte",
    "effective-directive": "font-src",
    disposition: "report",
  },
});

const INFORME_REPORTS = JSON.stringify([
  { type: "csp-violation", url: "https://app.ejemplo.com/dashboard", body: { effectiveDirective: "img-src", blockedURL: "https://img.ejemplo.com/a.png?t=SECRETO" } },
  { type: "csp-violation", url: "https://app.ejemplo.com/dashboard", body: { effectiveDirective: "font-src", blockedURL: "https://f.ejemplo.com/x.woff2" } },
]);

function peticion(body: BodyInit | null, tipo: string | null = "application/csp-report", extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (tipo) headers["content-type"] = tipo;
  return new NextRequest("http://localhost/api/csp-report", { method: "POST", headers, body });
}

let aviso: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  limite.clientIp.mockReturnValue("1.2.3.4");
  limite.rateLimit.mockResolvedValue({ allowed: true });
  aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function responde204(r: Response) {
  expect(r.status).toBe(204);
  expect(await r.text()).toBe("");
}

describe("POST /api/csp-report", () => {
  it("application/csp-report: responde 204 y deja UNA línea con directiva y host (sin ruta, consulta ni fragmento)", async () => {
    const r = await POST(peticion(INFORME_URI));
    await responde204(r);
    expect(aviso).toHaveBeenCalledTimes(1);
    const linea = String(aviso.mock.calls[0][0]);
    expect(linea).toBe("[csp-report] directiva=font-src bloqueado=fonts.ejemplo.com modo=informe");
    for (const filtrado of ["SECRETO", "TOKEN", "woff2", "frag", "parte", "?"]) expect(linea).not.toContain(filtrado);
  });

  it("application/reports+json con varios informes: 204 y una sola línea para toda la petición", async () => {
    const r = await POST(peticion(INFORME_REPORTS, "application/reports+json"));
    await responde204(r);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toBe("[csp-report] directiva=img-src bloqueado=img.ejemplo.com modo=informe (+1 más)");
  });

  it("acepta el tipo con parámetros y en mayúsculas", async () => {
    await responde204(await POST(peticion(INFORME_URI, "Application/CSP-Report; charset=utf-8")));
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("nunca pone nada más que 204 sin cuerpo, con Cache-Control: no-store", async () => {
    const r = await POST(peticion(INFORME_URI));
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.body).toBeNull();
  });

  it("limita por IP con el limitador de la aplicación, con tope acotado y sin fallar abierto", async () => {
    await POST(peticion(INFORME_URI));
    expect(limite.rateLimit).toHaveBeenCalledTimes(1);
    expect(limite.rateLimit).toHaveBeenCalledWith("csp:ip:1.2.3.4", { max: 60, windowMs: 60_000, failClosed: true });
  });

  it("pasado el límite: 204 sin escribir nada en el log", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30 });
    await responde204(await POST(peticion(INFORME_URI)));
    expect(aviso).not.toHaveBeenCalled();
  });

  it("si el contador falla (base caída, failClosed): 204 y nada en el log", async () => {
    limite.rateLimit.mockResolvedValue({ allowed: false, retryAfterSec: 30, unavailable: true });
    await responde204(await POST(peticion(INFORME_URI)));
    expect(aviso).not.toHaveBeenCalled();
  });

  it("si el limitador lanza una excepción: 204, no se propaga", async () => {
    limite.rateLimit.mockRejectedValue(new Error("boom"));
    await responde204(await POST(peticion(INFORME_URI)));
    expect(aviso).not.toHaveBeenCalled();
  });

  it("tipo de contenido que no es de informes: 204 sin tocar la base ni el log", async () => {
    for (const tipo of ["application/json", "text/plain", "application/x-www-form-urlencoded", null]) {
      await responde204(await POST(peticion(INFORME_URI, tipo)));
    }
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("Content-Length mayor que 8 KB: 204 sin tocar la base ni el log", async () => {
    await responde204(await POST(peticion(INFORME_URI, "application/csp-report", { "content-length": "8193" })));
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("cuerpo mayor que 8 KB sin Content-Length (o con uno falso): se corta la lectura y no se registra nada", async () => {
    const enorme = JSON.stringify({ "csp-report": { "blocked-uri": "inline", "effective-directive": "script-src", relleno: "x".repeat(9000) } });
    expect(enorme.length).toBeGreaterThan(8192);
    await responde204(await POST(peticion(enorme)));
    await responde204(await POST(peticion(enorme, "application/csp-report", { "content-length": "100" })));
    expect(aviso).not.toHaveBeenCalled();
  });

  it("un cuerpo justo en el tope todavía se procesa", async () => {
    const base = { "csp-report": { "blocked-uri": "inline", "effective-directive": "script-src", relleno: "" } };
    const vacio = JSON.stringify(base).length;
    base["csp-report"].relleno = "x".repeat(8192 - vacio);
    const exacto = JSON.stringify(base);
    expect(exacto.length).toBe(8192);
    await responde204(await POST(peticion(exacto)));
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("JSON inválido, vacío o sin informe reconocible: 204 sin log", async () => {
    for (const cuerpo of ["", "{no es json", "[]", "{}", '{"csp-report": 3}']) {
      await responde204(await POST(peticion(cuerpo)));
    }
    expect(aviso).not.toHaveBeenCalled();
  });

  it("sin cuerpo en absoluto: 204", async () => {
    await responde204(await POST(peticion(null)));
    expect(aviso).not.toHaveBeenCalled();
  });

  it("un informe hostil no inyecta líneas falsas en el log", async () => {
    const hostil = JSON.stringify({
      "csp-report": { "blocked-uri": "https://evil.com/\n[csp-report] directiva=falsa", "effective-directive": "img-src\n[falso]" },
    });
    await responde204(await POST(peticion(hostil)));
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).not.toMatch(/[\n\r]/);
  });

  it("marca como «forzada» una violación de la política que sí bloquea", async () => {
    const enforce = JSON.stringify([{ type: "csp-violation", body: { effectiveDirective: "frame-ancestors", blockedURL: "https://malo.com/", disposition: "enforce" } }]);
    await POST(peticion(enforce, "application/reports+json"));
    expect(String(aviso.mock.calls[0][0])).toContain("modo=forzada");
  });

  it("nunca lanza, aunque falle la lectura del cuerpo", async () => {
    const req = peticion(INFORME_URI);
    Object.defineProperty(req, "body", { get: () => { throw new Error("lectura rota"); } });
    await responde204(await POST(req));
  });

  it("en modo demo (sin base de datos) no llama al limitador pero sí registra", async () => {
    vi.stubEnv("DEMO_MODE", "true");
    await responde204(await POST(peticion(INFORME_URI)));
    expect(limite.rateLimit).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});
