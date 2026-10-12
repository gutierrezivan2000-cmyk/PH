import { describe, expect, it } from "vitest";
import { esCabeceraDeGrabadora, esFirmaDeMedios } from "./firma-medios";

const bytes = (...b: number[]) => Uint8Array.from([...b, ...new Array(Math.max(0, 16 - b.length)).fill(0)]);
const texto = (t: string) => new TextEncoder().encode(t.padEnd(16, " "));
const EBML = bytes(0x1a, 0x45, 0xdf, 0xa3);
const MP4 = Uint8Array.from([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), 0, 0, 0, 0]);
const OGG = texto("OggS");

describe("esCabeceraDeGrabadora", () => {
  it("acepta lo que emite MediaRecorder: webm (EBML), mp4 (ftyp) y ogg", () => {
    expect(esCabeceraDeGrabadora(EBML)).toBe(true);
    expect(esCabeceraDeGrabadora(MP4)).toBe(true);
    expect(esCabeceraDeGrabadora(OGG)).toBe(true);
  });
  it("rechaza listas HLS, texto, vacío, muy corto y contenedores que la grabadora nunca emite", () => {
    expect(esCabeceraDeGrabadora(texto("#EXTM3U\n#EXT-X-VERS"))).toBe(false);
    expect(esCabeceraDeGrabadora(texto("<html><body>"))).toBe(false);
    expect(esCabeceraDeGrabadora(new Uint8Array(0))).toBe(false);
    expect(esCabeceraDeGrabadora(bytes(0x1a, 0x45, 0xdf))).toBe(false);
    expect(esCabeceraDeGrabadora(texto("RIFF....WAVE"))).toBe(false);
  });
});

describe("esFirmaDeMedios", () => {
  it("acepta contenedores comunes y rechaza texto", () => {
    expect(esFirmaDeMedios(EBML)).toBe(true);
    expect(esFirmaDeMedios(MP4)).toBe(true);
    expect(esFirmaDeMedios(texto("ID3"))).toBe(true);
    expect(esFirmaDeMedios(texto("#EXTM3U"))).toBe(false);
    expect(esFirmaDeMedios(new Uint8Array(4))).toBe(false);
  });
});
