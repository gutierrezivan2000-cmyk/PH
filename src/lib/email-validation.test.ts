import { describe, it, expect } from "vitest";

/**
 * Réplica de las regex de src/app/api/properties/[propertyId]/units/route.ts.
 * Se prueban aquí porque el fallo era silencioso y caro: una celda con texto
 * alrededor pasaba la validación, se guardaba entera como correo, y después
 * Resend rechazaba el lote completo de hasta 100 destinatarios — ningún
 * residente recibía su enlace de portal.
 */
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const EMAIL_EXACT_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function extractEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (EMAIL_EXACT_RE.test(v)) return v.slice(0, 120);
  const m = v.match(EMAIL_RE);
  return m ? m[0].slice(0, 120) : null;
}

describe("extractEmail", () => {
  it("acepta un correo limpio", () => {
    expect(extractEmail("Maria@Correo.com")).toBe("maria@correo.com");
    expect(extractEmail("  juan.perez+ph@x.co  ")).toBe("juan.perez+ph@x.co");
  });

  it("extrae el correo cuando la celda trae el nombre pegado", () => {
    // Antes se guardaba "maría pérez maria@x.com" ENTERO como email.
    expect(extractEmail("María Pérez maria@x.com")).toBe("maria@x.com");
    expect(extractEmail("juan perez <juan@x.com>")).toBe("juan@x.com");
  });

  it("se queda con la primera dirección si la celda trae varias", () => {
    expect(extractEmail("juan@x.com / ana@x.com")).toBe("juan@x.com");
  });

  it("devuelve null cuando no hay ningún correo", () => {
    for (const v of ["", "   ", "sin correo", "arroba x punto com", "@x.com", "juan@", null, 42, undefined]) {
      expect(extractEmail(v)).toBeNull();
    }
  });

  it("nunca devuelve algo que no sea un correo exacto", () => {
    for (const v of ["María Pérez maria@x.com", "juan@x.com / ana@x.com", "<a@b.co>", "correo: z@y.org"]) {
      const out = extractEmail(v);
      expect(out).not.toBeNull();
      expect(EMAIL_EXACT_RE.test(out!)).toBe(true);
    }
  });
});

describe("EMAIL_EXACT_RE (validación del formulario)", () => {
  it("rechaza cadenas con texto alrededor", () => {
    expect(EMAIL_EXACT_RE.test("María Pérez maria@x.com")).toBe(false);
    expect(EMAIL_EXACT_RE.test("juan@x.com / ana@x.com")).toBe(false);
    expect(EMAIL_EXACT_RE.test("juan perez <juan@x.com>")).toBe(false);
  });

  it("acepta un correo bien formado", () => {
    expect(EMAIL_EXACT_RE.test("bueno@x.com")).toBe(true);
  });
});
