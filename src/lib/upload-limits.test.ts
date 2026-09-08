import { describe, it, expect } from "vitest";
import {
  esAudio, limiteMbPara, limiteBytesPara, extensionDe,
  ALLOWED_CONTENT_TYPES, MAX_AUDIO_MB, MAX_DOC_MB,
} from "./upload-limits";

describe("topes por tipo de archivo", () => {
  it("una grabación de asamblea cabe: es lo que hace posible el acta", () => {
    // 2 horas de MP3 rondan los 60–120 MB. Con el tope único de 25 MB, el
    // insumo principal del producto no entraba.
    expect(limiteMbPara("asamblea-ordinaria.mp3")).toBe(MAX_AUDIO_MB);
    expect(120 * 1024 * 1024).toBeLessThan(limiteBytesPara("asamblea.mp3"));
  });

  it("los documentos tienen su propio tope, más bajo", () => {
    expect(limiteMbPara("reglamento.pdf")).toBe(MAX_DOC_MB);
    expect(limiteMbPara("presupuesto.xlsx")).toBe(MAX_DOC_MB);
  });

  it("reconoce los formatos que graban los móviles de verdad", () => {
    for (const n of ["reunion.m4a", "audio.3gp", "nota.amr", "voz.opus", "grab.aac", "acta.wav"]) {
      expect(esAudio(n)).toBe(true);
      expect(limiteMbPara(n)).toBe(MAX_AUDIO_MB);
    }
  });

  it("no confunde un documento con audio por el nombre", () => {
    expect(esAudio("acta-de-la-asamblea-en-audio.pdf")).toBe(false);
    expect(esAudio("mp3.pdf")).toBe(false);
  });

  it("aguanta nombres raros sin romperse", () => {
    for (const n of ["", "sin-extension", ".", "archivo."]) {
      expect(() => limiteMbPara(n)).not.toThrow();
      expect(limiteMbPara(n)).toBe(MAX_DOC_MB);
    }
    expect(extensionDe("MI ACTA.MP3")).toBe("mp3");
  });

  it("la lista de tipos cubre lo que la pantalla deja escoger", () => {
    // El fallo original: la interfaz ofrecía m4a y el servidor lo rechazaba.
    for (const t of ["audio/mp4", "audio/x-m4a", "audio/3gpp", "audio/amr", "audio/opus", "audio/aac"]) {
      expect(ALLOWED_CONTENT_TYPES).toContain(t);
    }
  });

  it("el tope de audio es coherente con el tiempo de transcripción disponible", () => {
    // 200 s de presupuesto, segmentos de 10 min, 4 en paralelo ⇒ ~16 segmentos
    // ⇒ ~2,6 h. El tope en MB no debe prometer mucho más que eso.
    const horasQueCabenTranscribiendo = (4 * Math.floor(200 / 60) * 10) / 60;
    expect(horasQueCabenTranscribiendo).toBeGreaterThan(1.5);
    expect(MAX_AUDIO_MB).toBeLessThanOrEqual(250);
  });
});
