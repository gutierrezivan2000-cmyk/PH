import { describe, expect, it } from "vitest";
import {
  ErrorAudio, argumentosDeNormalizacion, clasificarSalidaFfmpeg, leerDuracionDeFfmpeg, leerLineaDeSegmento, leerRangoHttp,
} from "./ffmpeg";

describe("leerRangoHttp", () => {
  const T = 1000;
  it("sin cabecera no hay rango", () => {
    expect(leerRangoHttp(undefined, T)).toBeNull();
    expect(leerRangoHttp("", T)).toBeNull();
  });
  it("«a-b», «a-» y «-n»", () => {
    expect(leerRangoHttp("bytes=0-99", T)).toEqual({ desde: 0, hasta: 99 });
    expect(leerRangoHttp("bytes=900-", T)).toEqual({ desde: 900, hasta: 999 });
    expect(leerRangoHttp("bytes=-100", T)).toEqual({ desde: 900, hasta: 999 });
    expect(leerRangoHttp("bytes=-5000", T)).toEqual({ desde: 0, hasta: 999 });
  });
  it("un final pasado del archivo se recorta", () => {
    expect(leerRangoHttp("bytes=990-5000", T)).toEqual({ desde: 990, hasta: 999 });
  });
  it("fuera del archivo, al revés o de cero bytes: 416", () => {
    expect(leerRangoHttp("bytes=1000-", T)).toBe("invalido");
    expect(leerRangoHttp("bytes=2000-3000", T)).toBe("invalido");
    expect(leerRangoHttp("bytes=50-10", T)).toBe("invalido");
    expect(leerRangoHttp("bytes=-0", T)).toBe("invalido");
  });
  it("formas que no entendemos (varios rangos, otra unidad) se sirven enteras", () => {
    expect(leerRangoHttp("bytes=0-10,20-30", T)).toBeNull();
    expect(leerRangoHttp("items=0-10", T)).toBeNull();
    expect(leerRangoHttp("bytes=-", T)).toBeNull();
  });
});

describe("lectura de lo que escribe ffmpeg", () => {
  it("la duración del contenedor", () => {
    expect(leerDuracionDeFfmpeg("  Duration: 03:40:12.34, start: 0.000000, bitrate: 48 kb/s")).toBe(((3 * 60 + 40) * 60 + 12) * 1000 + 340);
    expect(leerDuracionDeFfmpeg("Duration: 00:00:20.01, start")).toBe(20_010);
    expect(leerDuracionDeFfmpeg("Duration: 00:25:00, start")).toBe(1_500_000);
    expect(leerDuracionDeFfmpeg("Duration: N/A, start: 0.000000")).toBeNull(); // WebM de MediaRecorder
    expect(leerDuracionDeFfmpeg("")).toBeNull();
  });
  it("una línea de la lista de segmentos", () => {
    expect(leerLineaDeSegmento("seg_0007.mp3,20.016000,22.069063")).toEqual({ nombre: "seg_0007.mp3", n: 7 });
    expect(leerLineaDeSegmento("seg_0123.mp3,0.000000,600.026122\n")).toEqual({ nombre: "seg_0123.mp3", n: 123 });
    expect(leerLineaDeSegmento("otra cosa")).toBeNull();
    expect(leerLineaDeSegmento("seg_0001.wav,0,1")).toBeNull();
    expect(leerLineaDeSegmento("")).toBeNull();
  });
});

describe("clasificarSalidaFfmpeg", () => {
  it("un archivo dañado o de un formato que no entiende no se arregla reintentando", () => {
    for (const salida of [
      "x.m4a: Invalid data found when processing input",
      "[mov,mp4,m4a,3gp,3g2,mj2 @ 0x1] moov atom not found",
      "Unsupported codec with id 1234",
      "Error while decoding stream #0:0: Invalid data found",
    ]) {
      const e = clasificarSalidaFfmpeg(salida);
      expect(e).toBeInstanceOf(ErrorAudio);
      expect(e.tipo, salida).toBe("fuente_invalida");
      expect(e.message).toMatch(/dañado|compatible/);
    }
  });
  it("un video sin audio dice que no hay audio", () => {
    for (const salida of ["Output file #0 does not contain any stream", "Stream map '0:a' matches no streams."]) {
      expect(clasificarSalidaFfmpeg(salida).tipo, salida).toBe("sin_audio");
    }
  });
  it("lo demás (la red, el servicio) es del momento y se reintenta, con la cola de la salida para diagnosticar", () => {
    const e = clasificarSalidaFfmpeg("línea 1\nlínea 2\nhttp://127.0.0.1:1/x: Connection refused");
    expect(e.tipo).toBe("transitorio");
    expect(e.message).toContain("Connection refused");
    expect(clasificarSalidaFfmpeg("").tipo).toBe("transitorio");
  });
});

describe("argumentosDeNormalizacion", () => {
  const args = argumentosDeNormalizacion({ url: "http://127.0.0.1:1234/abc", desdeMs: 0, numeroInicial: 0, tramoMs: 600_000, carpeta: "/tmp/x" });
  const valorDe = (a: string[], bandera: string) => a[a.indexOf(bandera) + 1];

  it("MP3 CBR 32 kbps, mono, 16 kHz, sin video ni metadatos", () => {
    expect(valorDe(args, "-c:a")).toBe("libmp3lame");
    expect(valorDe(args, "-b:a")).toBe("32k");
    expect(valorDe(args, "-ac")).toBe("1");
    expect(valorDe(args, "-ar")).toBe("16000");
    expect(args).toContain("-vn");
    expect(valorDe(args, "-map_metadata")).toBe("-1");
  });
  it("las opciones del MP3 van dentro de segment_format_options (sueltas las recibiría el muxer «segment»)", () => {
    expect(valorDe(args, "-segment_format_options")).toBe("id3v2_version=0:write_xing=0");
    expect(args).not.toContain("-write_xing");
    expect(valorDe(args, "-segment_format")).toBe("mp3");
  });
  it("segmentos de 10 min, con la lista por stdout y el patrón de nombre", () => {
    expect(valorDe(args, "-segment_time")).toBe("600");
    expect(valorDe(args, "-segment_list")).toBe("pipe:1");
    expect(valorDe(args, "-segment_list_type")).toBe("csv");
    expect(valorDe(args, "-reset_timestamps")).toBe("1");
    expect(args[args.length - 1]).toBe("/tmp/x/seg_%04d.mp3");
  });
  it("sin desde no hay -ss; con desde se salta ANTES de la entrada y la numeración sigue", () => {
    expect(args).not.toContain("-ss");
    const seguir = argumentosDeNormalizacion({ url: "u", desdeMs: 1_234_567, numeroInicial: 2, tramoMs: 600_000, carpeta: "/t" });
    expect(valorDe(seguir, "-ss")).toBe("1234.567");
    expect(seguir.indexOf("-ss")).toBeLessThan(seguir.indexOf("-i"));
    expect(valorDe(seguir, "-segment_start_number")).toBe("2");
  });
  it("si se corta la conexión con la fuente, vuelve a pedir desde donde iba", () => {
    expect(valorDe(args, "-reconnect")).toBe("1");
    expect(valorDe(args, "-reconnect_streamed")).toBe("1");
    expect(valorDe(args, "-rw_timeout")).toBe("30000000");
    expect(args.indexOf("-reconnect")).toBeLessThan(args.indexOf("-i"));
  });
});
