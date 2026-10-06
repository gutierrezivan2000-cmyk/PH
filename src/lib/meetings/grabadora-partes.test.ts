import { describe, expect, it } from "vitest";
import {
  MIMES_PREFERIDOS, TROZOS_POR_PARTE, detectarHuecos, elegirMime, extensionDeGrabacion, mimeBase, ordenarPartes, parteCabe,
  parteDeTrozo, partesCompletas, partesPendientes, trozosDeParte, unirTrozos,
} from "./grabadora-partes";
import { VIVO_PARTE_MAX_BYTES } from "./tipos";

describe("trozos y partes", () => {
  it("una parte son 6 trozos de 5 s (30 s)", () => {
    expect(TROZOS_POR_PARTE).toBe(6);
  });
  it("cada trozo pertenece a la parte que le toca, y cada parte sabe sus trozos", () => {
    expect([0, 5, 6, 11, 12].map(parteDeTrozo)).toEqual([0, 0, 1, 1, 2]);
    expect(trozosDeParte(0)).toEqual({ desde: 0, hasta: 5 });
    expect(trozosDeParte(3)).toEqual({ desde: 18, hasta: 23 });
    for (let idx = 0; idx < 100; idx++) {
      const { desde, hasta } = trozosDeParte(parteDeTrozo(idx));
      expect(idx).toBeGreaterThanOrEqual(desde);
      expect(idx).toBeLessThanOrEqual(hasta);
    }
  });
});

describe("partesCompletas", () => {
  it("con la sesión abierta solo cuentan las partes con sus seis trozos", () => {
    expect(partesCompletas(-1, false)).toEqual([]);
    expect(partesCompletas(0, false)).toEqual([]);
    expect(partesCompletas(4, false)).toEqual([]);
    expect(partesCompletas(5, false)).toEqual([0]); // trozos 0-5
    expect(partesCompletas(10, false)).toEqual([0]);
    expect(partesCompletas(11, false)).toEqual([0, 1]);
  });
  it("al cerrar la sesión se suma la última parte aunque esté incompleta", () => {
    expect(partesCompletas(-1, true)).toEqual([]);
    expect(partesCompletas(0, true)).toEqual([0]);
    expect(partesCompletas(5, true)).toEqual([0]);
    expect(partesCompletas(6, true)).toEqual([0, 1]);
    expect(partesCompletas(13, true)).toEqual([0, 1, 2]);
  });
  it("una hora de grabación son 120 partes", () => {
    const trozosEnUnaHora = (60 * 60) / 5;
    expect(partesCompletas(trozosEnUnaHora - 1, true)).toHaveLength(120);
  });
});

describe("partesPendientes", () => {
  it("lo listo menos lo que el servidor ya confirmó, en orden", () => {
    expect(partesPendientes(17, false, [])).toEqual([0, 1, 2]);
    expect(partesPendientes(17, false, [1])).toEqual([0, 2]);
    expect(partesPendientes(17, false, [0, 1, 2])).toEqual([]);
    expect(partesPendientes(18, true, [0, 1, 2])).toEqual([3]);
  });
  it("acepta cualquier iterable (un Set)", () => {
    expect(partesPendientes(11, false, new Set([0]))).toEqual([1]);
  });
});

describe("ordenarPartes", () => {
  it("ordena por sesión y luego por número, sin tocar el original", () => {
    const original = [{ session: 2, seq: 0 }, { session: 1, seq: 10 }, { session: 1, seq: 2 }, { session: 2, seq: 1 }];
    const copia = [...original];
    expect(ordenarPartes(original)).toEqual([{ session: 1, seq: 2 }, { session: 1, seq: 10 }, { session: 2, seq: 0 }, { session: 2, seq: 1 }]);
    expect(original).toEqual(copia);
  });
  it("conserva los demás campos", () => {
    expect(ordenarPartes([{ session: 1, seq: 1, bytes: 9 }, { session: 1, seq: 0, bytes: 7 }]).map((p) => p.bytes)).toEqual([7, 9]);
  });
});

describe("detectarHuecos", () => {
  it("sin huecos, nada", () => {
    expect(detectarHuecos([0, 1, 2, 3])).toEqual([]);
    expect(detectarHuecos([])).toEqual([]);
    expect(detectarHuecos([0])).toEqual([]);
  });
  it("lista las que faltan entre 0 y la mayor que llegó", () => {
    expect(detectarHuecos([0, 1, 4, 5])).toEqual([2, 3]);
    expect(detectarHuecos([3])).toEqual([0, 1, 2]);
    expect(detectarHuecos([5, 0, 2])).toEqual([1, 3, 4]);
  });
  it("con la última declarada, detecta también lo que falta AL FINAL", () => {
    expect(detectarHuecos([0, 1, 2], 5)).toEqual([3, 4, 5]);
    expect(detectarHuecos([], 2)).toEqual([0, 1, 2]);
    expect(detectarHuecos([0, 1, 2], 2)).toEqual([]);
  });
  it("las repetidas no estorban", () => {
    expect(detectarHuecos([0, 0, 2, 2])).toEqual([1]);
  });
  it("una hora con una sola parte perdida", () => {
    const todas = Array.from({ length: 120 }, (_, k) => k).filter((k) => k !== 57);
    expect(detectarHuecos(todas, 119)).toEqual([57]);
  });
});

describe("tipos de grabación", () => {
  it("la extensión sale del tipo, con o sin parámetros", () => {
    expect(extensionDeGrabacion("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionDeGrabacion("audio/webm")).toBe("webm");
    expect(extensionDeGrabacion("AUDIO/MP4")).toBe("mp4");
    expect(extensionDeGrabacion("audio/x-m4a")).toBe("mp4");
    expect(extensionDeGrabacion("audio/ogg;codecs=opus")).toBe("ogg");
    for (const raro of ["video/webm", "audio/wav", "application/pdf", ""]) expect(extensionDeGrabacion(raro), raro).toBeNull();
  });
  it("mimeBase quita los parámetros", () => {
    expect(mimeBase("audio/webm; codecs=opus")).toBe("audio/webm");
    expect(mimeBase("audio/mp4")).toBe("audio/mp4");
  });
  it("elige el primer tipo que el navegador soporte, en orden de preferencia", () => {
    expect(elegirMime(() => true)).toBe("audio/webm;codecs=opus");
    expect(elegirMime((m) => m === "audio/mp4")).toBe("audio/mp4"); // Safari
    expect(elegirMime((m) => m.startsWith("audio/ogg"))).toBe("audio/ogg;codecs=opus");
    expect(elegirMime(() => false)).toBeNull();
    expect(MIMES_PREFERIDOS[0]).toBe("audio/webm;codecs=opus");
  });
});

describe("parteCabe", () => {
  it("de 1 byte hasta el tope del servidor", () => {
    expect(parteCabe(1)).toBe(true);
    expect(parteCabe(VIVO_PARTE_MAX_BYTES)).toBe(true);
    expect(parteCabe(0)).toBe(false);
    expect(parteCabe(VIVO_PARTE_MAX_BYTES + 1)).toBe(false);
  });
  it("30 s a 32 kbps (≈ 120 KB) caben de sobra", () => {
    expect(parteCabe((32_000 / 8) * 30)).toBe(true);
  });
});

describe("unirTrozos", () => {
  it("el orden de los trozos es el contenido del archivo", async () => {
    const a = new Uint8Array([1, 2]).buffer;
    const b = new Uint8Array([3]).buffer;
    const c = new Uint8Array([4, 5, 6]).buffer;
    const unido = unirTrozos([a, b, c], "audio/webm;codecs=opus");
    expect(unido.type).toBe("audio/webm");
    expect(unido.size).toBe(6);
    expect([...new Uint8Array(await unido.arrayBuffer())]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...new Uint8Array(await unirTrozos([c, a], "audio/mp4").arrayBuffer())]).toEqual([4, 5, 6, 1, 2]);
  });
});
