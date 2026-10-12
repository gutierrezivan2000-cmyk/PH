import { describe, expect, it } from "vitest";
import { baseUrlPublica, decidirPazYSalvo, estaVencido, hoyEnBogota, validarMotivoDeRevocacion, vigenciaPorDefecto } from "./certificados";

describe("decidirPazYSalvo", () => {
  it("no se emite si la cartera dice que la unidad tiene valores vencidos", () => {
    const d = decidirPazYSalvo({ cartera: { enMora: 250_000, saldo: 400_000 }, confirmaAlDia: true });
    expect(d).toMatchObject({ ok: false, codigo: "saldo_pendiente", enMora: 250_000 });
    expect(d.ok === false && d.mensaje).toContain("250.000");
  });
  it("una declaración de «al día» no pasa por encima de lo que dice la cartera", () => {
    expect(decidirPazYSalvo({ cartera: { enMora: 1_000, saldo: 1_000 }, confirmaAlDia: true }).ok).toBe(false);
  });
  it("con cartera y sin mora se emite y se guarda el saldo verificado", () => {
    expect(decidirPazYSalvo({ cartera: { enMora: 0, saldo: -50_000 }, confirmaAlDia: false })).toEqual({
      ok: true,
      verificacion: { origen: "cartera", enMora: 0, saldo: -50_000 },
    });
  });
  it("lo que no llega a medio peso no cuenta como deuda", () => {
    expect(decidirPazYSalvo({ cartera: { enMora: 0.3, saldo: 0.3 }, confirmaAlDia: false }).ok).toBe(true);
  });
  it("sin unidad del directorio hay que declarar que se verificó; con la declaración queda como «declarado»", () => {
    expect(decidirPazYSalvo({ cartera: null, confirmaAlDia: false })).toMatchObject({ ok: false, codigo: "falta_confirmacion" });
    expect(decidirPazYSalvo({ cartera: null, confirmaAlDia: true })).toEqual({ ok: true, verificacion: { origen: "declarado" } });
  });
});

describe("vigencia por defecto", () => {
  it("el paz y salvo vence a los 30 días y la residencia a los 90, contados desde hoy en Bogotá", () => {
    const ahora = new Date("2026-10-09T15:00:00Z");
    expect(hoyEnBogota(ahora)).toBe("2026-10-09");
    expect(vigenciaPorDefecto("paz_y_salvo", ahora)).toBe("2026-11-08");
    expect(vigenciaPorDefecto("residencia", ahora)).toBe("2027-01-07");
  });
  it("de noche en Bogotá todavía es el mismo día aunque en UTC ya sea el siguiente", () => {
    expect(hoyEnBogota(new Date("2026-10-10T03:30:00Z"))).toBe("2026-10-09");
  });
});

describe("validarMotivoDeRevocacion", () => {
  it("exige un motivo real y lo limpia", () => {
    expect(validarMotivoDeRevocacion("corto")).toMatchObject({ ok: false });
    expect(validarMotivoDeRevocacion(undefined)).toMatchObject({ ok: false });
    expect(validarMotivoDeRevocacion("   Se expidió   a la unidad  equivocada ")).toEqual({ ok: true, motivo: "Se expidió a la unidad equivocada" });
  });
});

describe("baseUrlPublica", () => {
  it("usa la dirección configurada y solo si falta, la de la petición", () => {
    expect(baseUrlPublica("https://app.ejemplo.com/", { host: "malo.com", proto: "https" })).toBe("https://app.ejemplo.com");
    expect(baseUrlPublica(undefined, { host: "mi.app", proto: "https" })).toBe("https://mi.app");
    expect(baseUrlPublica("no es una url", { host: "mi.app", proto: "http" })).toBe("http://mi.app");
  });

  it("con Host en la petición lo conserva aunque el entorno tenga el dominio de Vercel", () => {
    expect(baseUrlPublica(undefined, { host: "mi.app", proto: "https" }, { VERCEL_PROJECT_PRODUCTION_URL: "ph.vercel.app" })).toBe("https://mi.app");
  });

  it("sin dirección configurada y sin Host usa la dirección pública de la aplicación (urlBase), no localhost", () => {
    const entorno = { VERCEL_PROJECT_PRODUCTION_URL: "ph.vercel.app", NODE_ENV: "production" };
    expect(baseUrlPublica(undefined, {}, entorno)).toBe("https://ph.vercel.app");
    expect(baseUrlPublica("", { host: null, proto: "http" }, entorno)).toBe("https://ph.vercel.app");
    expect(baseUrlPublica(undefined, { host: "  " }, entorno)).toBe("https://ph.vercel.app");
  });

  it("en producción sin dirección configurada ni Host NO inventa localhost: el error sube", () => {
    expect(() => baseUrlPublica(undefined, { host: null }, { NODE_ENV: "production" })).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => baseUrlPublica(undefined, {}, { VERCEL_ENV: "production" })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("en desarrollo sin nada sí cae en localhost (como urlBase)", () => {
    expect(baseUrlPublica(undefined, {}, {})).toBe("http://localhost:3000");
  });

  it("la dirección configurada manda sobre el Host y sobre el entorno", () => {
    expect(
      baseUrlPublica("https://app.ejemplo.com", { host: "malo.com" }, { VERCEL_PROJECT_PRODUCTION_URL: "otro.vercel.app", NODE_ENV: "production" })
    ).toBe("https://app.ejemplo.com");
  });
});

describe("estaVencido", () => {
  it("vence después de su último día (inclusive), en el calendario de Bogotá", () => {
    // 10 de octubre 8 p. m. en Bogotá = 11 de octubre en UTC: aún no vence un certificado con validez hasta el 10.
    expect(estaVencido("2026-10-10", new Date("2026-10-11T01:00:00Z"))).toBe(false);
    expect(estaVencido("2026-10-10", new Date("2026-10-11T13:00:00Z"))).toBe(true);
  });

  it("sin fecha válida no se marca como vencido", () => {
    expect(estaVencido(undefined)).toBe(false);
    expect(estaVencido(null)).toBe(false);
    expect(estaVencido("ayer")).toBe(false);
  });
});

