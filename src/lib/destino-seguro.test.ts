import { describe, it, expect } from "vitest";
import { destinoSeguro } from "./destino-seguro";

describe("destinoSeguro (callbackUrl tras iniciar sesión)", () => {
  it("deja pasar rutas internas", () => {
    expect(destinoSeguro("/dashboard")).toBe("/dashboard");
    expect(destinoSeguro("/dashboard/reuniones/abc?tab=resumen")).toBe("/dashboard/reuniones/abc?tab=resumen");
  });

  it("cae en /dashboard si falta o está vacío", () => {
    expect(destinoSeguro(null)).toBe("/dashboard");
    expect(destinoSeguro("")).toBe("/dashboard");
  });

  it("rechaza URLs absolutas, protocolo relativo y javascript:", () => {
    expect(destinoSeguro("https://evil.example")).toBe("/dashboard");
    expect(destinoSeguro("javascript:alert(1)")).toBe("/dashboard");
    expect(destinoSeguro("//evil.example")).toBe("/dashboard");
    expect(destinoSeguro("/\\evil.example")).toBe("/dashboard");
  });

  it("rechaza caracteres de control (cabeceras y saltos de línea)", () => {
    expect(destinoSeguro("/ok\nSet-Cookie: x")).toBe("/dashboard");
    expect(destinoSeguro("/ok\u0000")).toBe("/dashboard");
  });

  it("usa la ruta por defecto que se indique", () => {
    expect(destinoSeguro("https://evil.example", "/")).toBe("/");
  });
});
