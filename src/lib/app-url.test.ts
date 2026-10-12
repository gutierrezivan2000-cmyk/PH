import { describe, it, expect } from "vitest";
import { urlBase } from "./app-url";

describe("urlBase", () => {
  it("usa NEXT_PUBLIC_APP_URL y le quita barra final y ruta", () => {
    expect(urlBase({ NEXT_PUBLIC_APP_URL: "https://app.ejemplo.co/" })).toBe("https://app.ejemplo.co");
    expect(urlBase({ NEXT_PUBLIC_APP_URL: "https://app.ejemplo.co/dashboard?x=1" })).toBe("https://app.ejemplo.co");
  });

  it("sin variable explícita, prefiere el dominio de producción de Vercel", () => {
    expect(urlBase({ VERCEL_PROJECT_PRODUCTION_URL: "ph.vercel.app", VERCEL_URL: "ph-abc.vercel.app" })).toBe("https://ph.vercel.app");
    expect(urlBase({ VERCEL_URL: "ph-abc.vercel.app" })).toBe("https://ph-abc.vercel.app");
  });

  it("en desarrollo cae en localhost", () => {
    expect(urlBase({ NODE_ENV: "development" })).toBe("http://localhost:3000");
    expect(urlBase({})).toBe("http://localhost:3000");
  });

  it("en producción sin ninguna dirección falla, no devuelve localhost", () => {
    expect(() => urlBase({ NODE_ENV: "production" })).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => urlBase({ VERCEL_ENV: "production" })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rechaza esquemas que no sean http/https", () => {
    expect(() => urlBase({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" })).toThrow();
  });
});
