import { describe, it, expect } from "vitest";
import { secretoCoincide } from "./secreto";

describe("secretoCoincide", () => {
  it("coincide solo con el mismo valor", () => {
    expect(secretoCoincide("abc123", "abc123")).toBe(true);
    expect(secretoCoincide("abc124", "abc123")).toBe(false);
  });

  it("no coincide si la longitud es distinta (sin revelar la longitud)", () => {
    expect(secretoCoincide("abc", "abc123")).toBe(false);
    expect(secretoCoincide("abc123456", "abc123")).toBe(false);
  });

  it("nunca coincide si falta el recibido o el configurado", () => {
    expect(secretoCoincide(null, "abc")).toBe(false);
    expect(secretoCoincide("", "abc")).toBe(false);
    expect(secretoCoincide("abc", undefined)).toBe(false);
    expect(secretoCoincide("", "")).toBe(false);
  });

  it("compara la cabecera Bearer completa como lo hacen los cron", () => {
    expect(secretoCoincide("Bearer s3cr3t", "Bearer s3cr3t")).toBe(true);
    expect(secretoCoincide("s3cr3t", "Bearer s3cr3t")).toBe(false);
  });
});
