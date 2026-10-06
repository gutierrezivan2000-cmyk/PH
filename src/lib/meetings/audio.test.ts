import { describe, expect, it } from "vitest";
import {
  byteDeMs, empiezaConTrama, esMultiploDeTrama, leerSegmentos, normalizadoMs, rangoDeBytes, rutaDeSegmento, siguienteSegmento,
} from "./audio";

describe("byteDeMs y rangoDeBytes (a 32 kbps cada trama son 144 bytes y 36 ms)", () => {
  it("el milisegundo t está en el byte floor(t / 36) * 144", () => {
    expect(byteDeMs(0)).toBe(0);
    expect(byteDeMs(35)).toBe(0);
    expect(byteDeMs(36)).toBe(144);
    expect(byteDeMs(1000)).toBe(27 * 144);
    expect(byteDeMs(-5)).toBe(0);
  });

  it("un rango abarca de la trama que contiene el principio a la que contiene el final, inclusive", () => {
    expect(rangoDeBytes(0, 36)).toEqual({ desde: 0, hasta: 143 }); // una sola trama
    expect(rangoDeBytes(0, 37)).toEqual({ desde: 0, hasta: 287 }); // la 37 cae en la segunda
    expect(rangoDeBytes(570_000, 1_230_000)).toEqual({ desde: Math.floor(570_000 / 36) * 144, hasta: Math.ceil(1_230_000 / 36) * 144 - 1 });
  });

  it("siempre cubre al menos una trama y nunca pasa del final del archivo", () => {
    expect(rangoDeBytes(100, 100).hasta).toBeGreaterThanOrEqual(rangoDeBytes(100, 100).desde);
    expect(rangoDeBytes(0, 10_000, 1000)).toEqual({ desde: 0, hasta: 999 });
    expect(rangoDeBytes(36, 72)).toEqual({ desde: 144, hasta: 287 });
  });

  it("el tamaño de un rango de N ms es ~4 bytes por milisegundo", () => {
    const r = rangoDeBytes(600_000, 1_200_000);
    expect((r.hasta - r.desde + 1) / 4).toBeGreaterThanOrEqual(600_000);
    expect((r.hasta - r.desde + 1) / 4).toBeLessThan(600_000 + 72);
  });
});

describe("esMultiploDeTrama y empiezaConTrama", () => {
  it("solo los tamaños de tramas completas sirven", () => {
    expect(esMultiploDeTrama(144)).toBe(true);
    expect(esMultiploDeTrama(2_400_048)).toBe(true);
    expect(esMultiploDeTrama(145)).toBe(false);
    expect(esMultiploDeTrama(0)).toBe(false);
  });
  it("reconoce la cabecera FF F3 (MPEG-2 capa III) y rechaza un ID3 o un Xing", () => {
    expect(empiezaConTrama(Uint8Array.of(0xff, 0xf3, 0x20))).toBe(true);
    expect(empiezaConTrama(Uint8Array.of(0xff, 0xf2))).toBe(true); // con CRC
    expect(empiezaConTrama(Uint8Array.of(0x49, 0x44, 0x33))).toBe(false); // «ID3»
    expect(empiezaConTrama(Uint8Array.of(0xff))).toBe(false);
    expect(empiezaConTrama(new Uint8Array(0))).toBe(false);
    expect(empiezaConTrama(Uint8Array.of(0xff, 0xfb))).toBe(false); // MPEG-1: otra tasa, no la nuestra
  });
});

describe("segmentos guardados", () => {
  const seg = (n: number, bytes: number) => ({ n, url: `u${n}`, durationMs: bytes / 4, bytes });
  it("lo normalizado y dónde seguir salen de los bytes", () => {
    expect(normalizadoMs([])).toBe(0);
    expect(normalizadoMs([seg(0, 2_400_048), seg(1, 2_400_048)])).toBe(1_200_024);
    expect(siguienteSegmento([])).toEqual({ numero: 0, desdeMs: 0 });
    expect(siguienteSegmento([seg(0, 2_400_048), seg(1, 1_200_000)])).toEqual({ numero: 2, desdeMs: 900_012 });
  });
  it("la ruta de un segmento lleva la fuente y el número con ceros", () => {
    expect(rutaDeSegmento("meetings/abc/", "src1", 7)).toBe("meetings/abc/norm/src1/0007.mp3");
    expect(rutaDeSegmento("meetings/abc/", "src1", 1234)).toBe("meetings/abc/norm/src1/1234.mp3");
  });
  it("leerSegmentos acepta lo que se escribió y descarta lo demás, en orden", () => {
    expect(leerSegmentos([seg(2, 144), seg(0, 288), { n: "x", url: 1 }, null, { n: 1, url: "u", durationMs: 1, bytes: 0 }, 5])).toEqual([seg(0, 288), seg(2, 144)]);
    expect(leerSegmentos(undefined)).toEqual([]);
    expect(leerSegmentos({})).toEqual([]);
  });
});
