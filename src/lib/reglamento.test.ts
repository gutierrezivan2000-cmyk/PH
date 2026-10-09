import { describe, expect, it } from "vitest";
import { esLecturaFallida } from "./reglamento";

describe("esLecturaFallida: un marcador de error no es el reglamento", () => {
  it("reconoce los marcadores que devuelven los lectores cuando fallan", () => {
    expect(esLecturaFallida("[Imagen: reglamento.jpg — error al analizar: 529 Overloaded]")).toBe(true);
    expect(esLecturaFallida("[Imagen: foto.png — analisis visual no disponible (configura ANTHROPIC_API_KEY)]")).toBe(true);
    expect(esLecturaFallida("[Imagen: foto.heic — formato no soportado para analisis visual (image/heic)]")).toBe(true);
    expect(esLecturaFallida("[Archivo: manual.pdf — no se pudo procesar: PDF dañado]")).toBe(true);
    expect(esLecturaFallida("  [Archivo: x.docx — Error al procesar: vacío]  ")).toBe(true);
  });

  it("no confunde un reglamento real, ni un análisis de imagen que sí salió bien", () => {
    expect(esLecturaFallida("ARTÍCULO 1. Los residentes deben respetar el horario de silencio.")).toBe(false);
    expect(esLecturaFallida("[Análisis de imagen: reglamento.jpg]\nArtículo 2. Las mascotas deben ir con correa.")).toBe(false);
    expect(esLecturaFallida("")).toBe(false);
  });
});
