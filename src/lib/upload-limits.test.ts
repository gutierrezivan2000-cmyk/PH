import { describe, it, expect } from "vitest";
import {
  esAudio, limiteMbPara, limiteBytesPara, extensionDe,
  ALLOWED_CONTENT_TYPES, MAX_AUDIO_MB, MAX_DOC_MB, formatoTamano,
  ACCEPT_REUNION, TIPOS_ARCHIVO_REUNION, esArchivoDeReunion, esTipoDeReunionPermitido, tipoDeArchivoReunion,
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

describe("formatoTamano", () => {
  // El bug concreto: un .docx de 402 bytes se mostraba como «0KB» en la ficha
  // de archivo del chat, y parecía que la descarga estaba vacía.
  it("no colapsa a cero los archivos de menos de 1 KB", () => {
    expect(formatoTamano(402)).toBe("402 B");
    expect(formatoTamano(1)).toBe("1 B");
  });

  it("usa un decimal por debajo de 10 KB, donde redondear engaña", () => {
    expect(formatoTamano(1536)).toBe("1.5 KB");
    expect(formatoTamano(8900)).toBe("8.7 KB");
  });

  it("redondea a entero entre 10 KB y 1000 KB", () => {
    expect(formatoTamano(50 * 1024)).toBe("50 KB");
  });

  it("escala a MB en vez de mostrar «2930KB»", () => {
    expect(formatoTamano(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(formatoTamano(25 * 1024 * 1024)).toBe("25.0 MB");
  });

  it("devuelve cadena vacía para tamaños ausentes o absurdos, para poder ocultar la etiqueta", () => {
    expect(formatoTamano(0)).toBe("");
    expect(formatoTamano(-5)).toBe("");
    expect(formatoTamano(NaN)).toBe("");
  });

  it("pasa a GB cuando un archivo de reunión lo pide (un WAV de 8 h pesa ~5,5 GB)", () => {
    expect(formatoTamano(999 * 1024 * 1024)).toBe("999.0 MB");
    expect(formatoTamano(1000 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatoTamano(5.5 * 1024 * 1024 * 1024)).toBe("5.5 GB");
    expect(formatoTamano(20 * 1024 * 1024 * 1024)).toBe("20.0 GB");
  });
});

describe("archivos de reuniones (audio y video, sin tope por tamaño)", () => {
  it("acepta el audio de siempre y los videos que entregan Zoom, Meet, Teams y el celular", () => {
    for (const n of ["consejo.mp3", "voz.m4a", "acta.wav", "zoom.mp4", "iphone.mov", "teams.mkv", "meet.webm", "vieja.avi", "grab.AMR"]) {
      expect(esArchivoDeReunion(n), n).toBe(true);
    }
  });
  it("rechaza lo que no es una grabación", () => {
    for (const n of ["acta.pdf", "presupuesto.xlsx", "foto.jpg", "sin-extension", "mp3.pdf", ""]) {
      expect(esArchivoDeReunion(n), n).toBe(false);
    }
  });
  it("su lista de tipos incluye todo el audio permitido y los videos", () => {
    for (const t of ALLOWED_CONTENT_TYPES.filter((x) => x.startsWith("audio/"))) {
      expect(TIPOS_ARCHIVO_REUNION).toContain(t);
    }
    for (const t of ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska"]) {
      expect(esTipoDeReunionPermitido(t), t).toBe(true);
    }
    expect(esTipoDeReunionPermitido("application/pdf")).toBe(false);
    expect(esTipoDeReunionPermitido("application/octet-stream")).toBe(false);
    expect(esTipoDeReunionPermitido("image/png")).toBe(false);
  });
  it("sin tipo del navegador, lo deduce de la extensión (el .mp4 como video, el audio como audio)", () => {
    expect(tipoDeArchivoReunion({ name: "reunion.m4a", type: "" })).toBe("audio/mp4");
    expect(tipoDeArchivoReunion({ name: "reunion.mp3" })).toBe("audio/mpeg");
    expect(tipoDeArchivoReunion({ name: "zoom.mp4", type: "" })).toBe("video/mp4");
    expect(tipoDeArchivoReunion({ name: "iphone.MOV", type: "application/octet-stream" })).toBe("video/quicktime");
    expect(tipoDeArchivoReunion({ name: "raro.xyz", type: "" })).toBe("application/octet-stream");
  });
  it("respeta el tipo que ya trae el navegador", () => {
    expect(tipoDeArchivoReunion({ name: "x.mp4", type: "audio/mp4" })).toBe("audio/mp4");
    expect(tipoDeArchivoReunion({ name: "x.webm", type: "video/webm" })).toBe("video/webm");
  });
  it("todo tipo que se deduce de una extensión aceptada está permitido (si no, la subida moriría tras subir el archivo entero)", () => {
    for (const ext of ACCEPT_REUNION.split(",").map((e) => e.slice(1))) {
      const tipo = tipoDeArchivoReunion({ name: `grabacion.${ext}`, type: "" });
      expect(esTipoDeReunionPermitido(tipo), `${ext} → ${tipo}`).toBe(true);
    }
  });
  it("el selector de archivos y la lista de extensiones aceptadas coinciden", () => {
    for (const ext of ACCEPT_REUNION.split(",").map((e) => e.slice(1))) {
      expect(esArchivoDeReunion(`grabacion.${ext}`), ext).toBe(true);
    }
  });
});
