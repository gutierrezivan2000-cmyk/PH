import { describe, expect, it } from "vitest";
import {
  BLOQUE_MS, CLAVES_TIPO_REUNION, ESPERAS_REINTENTO_MS, ESTADOS_REUNION, MAX_INTENTOS_TAREA, MP3_BYTES_POR_MS,
  MP3_KBPS, MP3_TRAMA_BYTES, MP3_TRAMA_MS, PARTE_SUBIDA_BYTES, SOLAPE_MS, TRAMO_MS,
  cortoTipoReunion, describirEstado, duracionMp3Cbr, esEstadoReunion, esTipoReunion, estaEnMarcha,
  formatearDuracion, formatearReloj, leerReloj, nombreTipoReunion, puedeAgregarFuentes,
} from "./tipos";

describe("formatearReloj", () => {
  it("siempre lleva horas, minutos y segundos", () => {
    expect(formatearReloj(0)).toBe("00:00:00");
    expect(formatearReloj(59_999)).toBe("00:00:59");
    expect(formatearReloj(4_990_000)).toBe("01:23:10");
    expect(formatearReloj(8 * 3_600_000)).toBe("08:00:00");
  });
  it("no se rompe con valores raros", () => {
    expect(formatearReloj(-5)).toBe("00:00:00");
    expect(formatearReloj(Number.NaN)).toBe("00:00:00");
    expect(formatearReloj(100 * 3_600_000)).toBe("100:00:00");
  });
});

describe("leerReloj", () => {
  it("lee hh:mm:ss y mm:ss", () => {
    expect(leerReloj("01:23:10")).toBe(4_990_000);
    expect(leerReloj("23:10")).toBe(1_390_000);
    expect(leerReloj("00:00:05")).toBe(5_000);
    expect(leerReloj(" 02:00:00 ")).toBe(7_200_000);
  });
  it("rechaza lo que no es un reloj", () => {
    expect(leerReloj("1:2")).toBeNull();
    expect(leerReloj("00:60:00")).toBeNull();
    expect(leerReloj("00:00:61")).toBeNull();
    expect(leerReloj("abc")).toBeNull();
    expect(leerReloj("")).toBeNull();
  });
  it("es la inversa de formatearReloj (al segundo)", () => {
    for (const ms of [0, 1_000, 61_000, 3_599_000, 3_600_000, 28_800_000, 29_999_000]) {
      expect(leerReloj(formatearReloj(ms))).toBe(ms);
    }
  });
});

describe("formatearDuracion", () => {
  it("se lee, no se mide", () => {
    expect(formatearDuracion(50_000)).toBe("50 s");
    expect(formatearDuracion(45 * 60_000)).toBe("45 min");
    expect(formatearDuracion((2 * 60 + 14) * 60_000)).toBe("2 h 14 min");
    expect(formatearDuracion((8 * 60 + 12) * 60_000)).toBe("8 h 12 min");
    expect(formatearDuracion(8 * 3_600_000)).toBe("8 h");
  });
  it("redondea al minuto y no deja «60 s» ni «1 h 60 min»", () => {
    expect(formatearDuracion(59_600)).toBe("1 min");
    expect(formatearDuracion((3 * 60 + 59) * 60_000 + 40_000)).toBe("4 h");
  });
  it("sin dato, una raya", () => {
    expect(formatearDuracion(null)).toBe("—");
    expect(formatearDuracion(undefined)).toBe("—");
    expect(formatearDuracion(0)).toBe("—");
    expect(formatearDuracion(Number.NaN)).toBe("—");
  });
});

describe("audio normalizado (MP3 CBR 32 kbps)", () => {
  it("las constantes son coherentes entre sí", () => {
    expect((MP3_KBPS * 1000) / 8).toBe(MP3_BYTES_POR_MS * 1000);
    expect(MP3_TRAMA_BYTES / MP3_BYTES_POR_MS).toBe(MP3_TRAMA_MS);
  });
  it("la duración sale del tamaño", () => {
    // Medido con el ffmpeg del proyecto: 25 min sintéticos → 41.669 tramas.
    expect(duracionMp3Cbr(6_000_336)).toBe(1_500_084);
    expect(duracionMp3Cbr(41_669 * MP3_TRAMA_BYTES)).toBe(41_669 * MP3_TRAMA_MS);
    expect(duracionMp3Cbr(0)).toBe(0);
    expect(duracionMp3Cbr(-10)).toBe(0);
  });
  it("8 horas de audio pesan unos 115 MB", () => {
    const bytes = 8 * 3_600_000 * MP3_BYTES_POR_MS;
    expect(bytes / 1024 / 1024).toBeGreaterThan(105);
    expect(bytes / 1024 / 1024).toBeLessThan(125);
  });
});

describe("constantes del procesamiento", () => {
  it("el solape es una fracción pequeña del tramo, y el bloque cabe varios tramos", () => {
    expect(SOLAPE_MS * 2).toBeLessThan(TRAMO_MS / 4);
    expect(BLOQUE_MS).toBeGreaterThan(TRAMO_MS);
  });
  it("hay una espera por cada reintento", () => {
    expect(ESPERAS_REINTENTO_MS.length).toBe(MAX_INTENTOS_TAREA);
    expect([...ESPERAS_REINTENTO_MS]).toEqual([...ESPERAS_REINTENTO_MS].sort((a, b) => a - b));
  });
  it("las partes de la subida respetan el mínimo de Blob (5 MB)", () => {
    expect(PARTE_SUBIDA_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024);
  });
});

describe("tipos de reunión", () => {
  it("reconoce solo los suyos (no claves heredadas del prototipo)", () => {
    for (const t of CLAVES_TIPO_REUNION) expect(esTipoReunion(t)).toBe(true);
    expect(esTipoReunion("toString")).toBe(false);
    expect(esTipoReunion("__proto__")).toBe(false);
    expect(esTipoReunion(undefined)).toBe(false);
    expect(esTipoReunion(3)).toBe(false);
  });
  it("da nombres legibles y una salida segura", () => {
    expect(nombreTipoReunion("consejo")).toBe("Consejo de administración");
    expect(nombreTipoReunion("asamblea_extraordinaria")).toBe("Asamblea extraordinaria");
    expect(cortoTipoReunion("comite")).toBe("Comité");
    expect(nombreTipoReunion("rara")).toBe("Reunión");
    expect(nombreTipoReunion(null)).toBe("Reunión");
  });
});

describe("estados", () => {
  it("cada estado conocido tiene su descripción, con tipo de kit y texto", () => {
    for (const s of ESTADOS_REUNION) {
      expect(esEstadoReunion(s)).toBe(true);
      const d = describirEstado({ status: s });
      expect(d.texto.length).toBeGreaterThan(0);
      expect(d.tipo).toBeTruthy();
    }
    expect(esEstadoReunion("otro")).toBe(false);
  });
  it("los significados no se mezclan: lista = ok, error = vencido, sin horas = falta", () => {
    expect(describirEstado({ status: "lista" })).toEqual({ tipo: "ok", texto: "Lista" });
    expect(describirEstado({ status: "error" }).tipo).toBe("vencido");
    expect(describirEstado({ status: "sin_cupo" })).toEqual({ tipo: "falta", texto: "Sin horas disponibles" });
    expect(describirEstado({ status: "borrador" })).toEqual({ tipo: "sin", texto: "Sin audio" });
    expect(describirEstado({ status: "en_cola" }).tipo).toBe("pendiente");
  });
  it("muestra el avance de la subida y de la transcripción", () => {
    expect(describirEstado({ status: "subiendo", progress: 45 }).texto).toBe("Subiendo 45 %");
    expect(describirEstado({ status: "subiendo", progress: 0 }).texto).toBe("Subiendo");
    expect(describirEstado({ status: "procesando", stage: "transcribiendo", hechas: 23, total: 48 }))
      .toEqual({ tipo: "enCurso", texto: "Transcribiendo 23 de 48" });
    expect(describirEstado({ status: "procesando", stage: "transcribiendo", progress: 47.6 }).texto).toBe("Transcribiendo 48 %");
    expect(describirEstado({ status: "procesando", stage: "transcribiendo" }).texto).toBe("Transcribiendo");
    expect(describirEstado({ status: "procesando", stage: "preparando_audio" }).texto).toBe("Preparando el audio");
    expect(describirEstado({ status: "procesando", stage: "uniendo" }).texto).toBe("Uniendo y verificando");
    expect(describirEstado({ status: "procesando", stage: "analizando" }).texto).toBe("Analizando con IA");
  });
  it("acota el porcentaje y tolera etapas desconocidas", () => {
    expect(describirEstado({ status: "subiendo", progress: 250 }).texto).toBe("Subiendo 100 %");
    expect(describirEstado({ status: "procesando", stage: "marciana" }).texto).toBe("Procesando");
    expect(describirEstado({ status: "procesando", stage: null }).texto).toBe("Procesando");
  });
  it("un estado desconocido se muestra neutro, sin romper", () => {
    expect(describirEstado({ status: "quien_sabe" })).toEqual({ tipo: "sin", texto: "quien_sabe" });
    expect(describirEstado({ status: "" }).texto).toBe("Sin estado");
  });
  it("solo se suman archivos antes de cerrar la captura", () => {
    expect(puedeAgregarFuentes("borrador")).toBe(true);
    expect(puedeAgregarFuentes("subiendo")).toBe(true);
    expect(puedeAgregarFuentes("error")).toBe(true);
    expect(puedeAgregarFuentes("procesando")).toBe(false);
    expect(puedeAgregarFuentes("lista")).toBe(false);
    expect(puedeAgregarFuentes("en_cola")).toBe(false);
  });
  it("el servidor sigue trabajando en cola y procesando", () => {
    expect(estaEnMarcha("en_cola")).toBe(true);
    expect(estaEnMarcha("procesando")).toBe(true);
    expect(estaEnMarcha("lista")).toBe(false);
    expect(estaEnMarcha("error")).toBe(false);
  });
});
