import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAIDA_DEL_NIVEL, abrirMicrofono, entornoDelNavegador, espacioLibreEnDispositivo, listarMicrofonos, mantenerPantallaEncendida,
  mensajeDeErrorMicrofono, nivelParaMedidor, nivelRms, pedirAlmacenamientoPersistente, soportaGrabacion, tomarCandado,
} from "./grabadora-navegador";

describe("nivelRms", () => {
  it("es 0 sin muestras o en silencio, y la amplitud en una onda cuadrada", () => {
    expect(nivelRms([])).toBe(0);
    expect(nivelRms(new Float32Array(100))).toBe(0);
    expect(nivelRms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5, 6);
  });
  it("una senoide de amplitud 1 da 1/√2", () => {
    const seno = Float32Array.from({ length: 1000 }, (_, i) => Math.sin((2 * Math.PI * i) / 100));
    expect(nivelRms(seno)).toBeCloseTo(Math.SQRT1_2, 2);
  });
});

describe("nivelParaMedidor", () => {
  it("de −60 dB (nada) a −10 dB (voz fuerte), acotado a 0..1", () => {
    expect(nivelParaMedidor(0)).toBe(0);
    expect(nivelParaMedidor(0.0001)).toBe(0); // −80 dB
    expect(nivelParaMedidor(0.001)).toBe(0); // −60 dB
    expect(nivelParaMedidor(10 ** (-35 / 20))).toBeCloseTo(0.5, 6);
    expect(nivelParaMedidor(10 ** (-10 / 20))).toBeCloseTo(1, 6);
    expect(nivelParaMedidor(1)).toBe(1);
  });
  it("lo que no es un número da 0", () => {
    for (const v of [Number.NaN, -1, Number.POSITIVE_INFINITY * 0]) expect(nivelParaMedidor(v)).toBe(0);
  });
  it("sube con el volumen", () => {
    expect(nivelParaMedidor(0.01)).toBeLessThan(nivelParaMedidor(0.05));
    expect(nivelParaMedidor(0.05)).toBeLessThan(nivelParaMedidor(0.2));
  });
});

describe("mensajeDeErrorMicrofono", () => {
  it("explica en español cada motivo", () => {
    const de = (name: string) => mensajeDeErrorMicrofono({ name });
    expect(de("NotAllowedError")).toMatch(/permiso/);
    expect(de("NotFoundError")).toMatch(/No encontramos un micrófono/);
    expect(de("OverconstrainedError")).toMatch(/No encontramos un micrófono/);
    expect(de("NotReadableError")).toMatch(/en uso por otra aplicación/);
    expect(de("SecurityError")).toMatch(/https/);
    expect(de("Cualquier otra")).toMatch(/No pudimos abrir el micrófono/);
    expect(mensajeDeErrorMicrofono(null)).toMatch(/No pudimos abrir el micrófono/);
    expect(mensajeDeErrorMicrofono(new Error("raro"))).toMatch(/No pudimos abrir el micrófono/);
  });
});

/* ── Un navegador de mentira ─────────────────────────────────────────── */

class PistaFalsa {
  detenida = false;
  escuchas: Record<string, Array<() => void>> = {};
  stop() { this.detenida = true; }
  addEventListener(tipo: string, f: () => void) { (this.escuchas[tipo] ??= []).push(f); }
}
class FlujoFalso {
  pistas = [new PistaFalsa()];
  getTracks() { return this.pistas; }
}
class GrabadorDeMentira {
  static soportados = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
  static isTypeSupported(m: string) { return GrabadorDeMentira.soportados.has(m); }
  static creados: Array<{ flujo: unknown; opciones: Record<string, unknown> }> = [];
  static fallar = false;
  constructor(flujo: unknown, opciones: Record<string, unknown>) {
    if (GrabadorDeMentira.fallar) throw new Error("NotSupportedError");
    GrabadorDeMentira.creados.push({ flujo, opciones });
  }
}
class ContextoFalso {
  static ultimo: ContextoFalso | null = null;
  static estadoInicial = "running";
  state = ContextoFalso.estadoInicial;
  cerrado = false;
  reanudado = 0;
  constructor() { ContextoFalso.ultimo = this; }
  analizador = { fftSize: 0, valor: 0.1, getFloatTimeDomainData(b: Float32Array) { b.fill(this.valor); } };
  createAnalyser() { return this.analizador; }
  createMediaStreamSource() { return { connect: () => {} }; }
  async resume() { this.reanudado++; }
  async close() { this.cerrado = true; }
}

let flujo: FlujoFalso;
let getUserMedia: ReturnType<typeof vi.fn>;

function montarNavegador(opciones: { seguro?: boolean; conMedia?: boolean; dispositivos?: unknown[] } = {}) {
  flujo = new FlujoFalso();
  getUserMedia = vi.fn(async () => flujo);
  vi.stubGlobal("window", { isSecureContext: opciones.seguro ?? true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", {
    onLine: true,
    mediaDevices: opciones.conMedia === false ? undefined : { getUserMedia, enumerateDevices: vi.fn(async () => opciones.dispositivos ?? []) },
  });
  vi.stubGlobal("MediaRecorder", GrabadorDeMentira);
  vi.stubGlobal("AudioContext", ContextoFalso);
}

beforeEach(() => {
  GrabadorDeMentira.creados = [];
  GrabadorDeMentira.fallar = false;
  GrabadorDeMentira.soportados = new Set(["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]);
  ContextoFalso.ultimo = null;
  ContextoFalso.estadoInicial = "running";
  montarNavegador();
});
afterEach(() => vi.unstubAllGlobals());

describe("soportaGrabacion", () => {
  it("sí, con micrófono, MediaRecorder y página segura", () => {
    expect(soportaGrabacion()).toEqual({ ok: true });
  });
  it("explica por qué no", () => {
    montarNavegador({ seguro: false });
    expect(soportaGrabacion()).toMatchObject({ ok: false, motivo: expect.stringMatching(/https/) });
    montarNavegador({ conMedia: false });
    expect(soportaGrabacion()).toMatchObject({ ok: false, motivo: expect.stringMatching(/usar el micrófono/) });
    montarNavegador();
    GrabadorDeMentira.soportados = new Set();
    expect(soportaGrabacion()).toMatchObject({ ok: false, motivo: expect.stringMatching(/grabar audio/) });
    vi.unstubAllGlobals();
    expect(soportaGrabacion()).toMatchObject({ ok: false });
  });
});

describe("abrirMicrofono", () => {
  it("pide una sola voz con eco, ruido y volumen tratados, y graba a 32 kbps con el mejor tipo disponible", async () => {
    const mic = await abrirMicrofono();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    expect(GrabadorDeMentira.creados[0].opciones).toEqual({ mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
    expect(mic.mime).toBe("audio/webm;codecs=opus");
  });

  it("Safari: sin WebM graba en MP4", async () => {
    GrabadorDeMentira.soportados = new Set(["audio/mp4"]);
    expect((await abrirMicrofono()).mime).toBe("audio/mp4");
  });

  it("con un micrófono elegido lo exige; si ese ya no existe, usa el predeterminado", async () => {
    await abrirMicrofono({ deviceId: "mic-2" });
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: expect.objectContaining({ deviceId: { exact: "mic-2" } }) });

    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("x"), { name: "OverconstrainedError" }));
    await abrirMicrofono({ deviceId: "mic-roto" });
    expect(getUserMedia).toHaveBeenLastCalledWith({ audio: expect.not.objectContaining({ deviceId: expect.anything() }) });
  });

  it("si no hay permiso, lanza el motivo en español", async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("Permission denied"), { name: "NotAllowedError" }));
    await expect(abrirMicrofono()).rejects.toThrow(/No tenemos permiso para usar el micrófono/);
  });

  it("si MediaRecorder falla, suelta el micrófono y lo explica", async () => {
    GrabadorDeMentira.fallar = true;
    await expect(abrirMicrofono()).rejects.toThrow(/no pudo preparar la grabación/);
    expect(flujo.pistas[0].detenida).toBe(true);
  });

  it("mide el nivel con el analizador", async () => {
    const mic = await abrirMicrofono();
    expect(mic.nivel()).toBeCloseTo(0.1, 5);
  });

  it("el nivel no salta: tras un golpe de sonido baja de a poco en vez de caer a cero", async () => {
    const mic = await abrirMicrofono();
    const analizador = ContextoFalso.ultimo!.analizador;
    expect(mic.nivel()).toBeCloseTo(0.1, 5); // el golpe
    analizador.valor = 0; // y después, silencio
    const lecturas = [mic.nivel(), mic.nivel(), mic.nivel()];
    expect(lecturas[0]).toBeCloseTo(0.1 * CAIDA_DEL_NIVEL, 6);
    expect(lecturas[1]).toBeCloseTo(0.1 * CAIDA_DEL_NIVEL ** 2, 6);
    expect(lecturas[2]).toBeLessThan(lecturas[1]);
    for (let i = 0; i < 60; i++) mic.nivel();
    expect(mic.nivel()).toBeLessThan(0.0001);
  });

  it("un sonido más fuerte que lo que queda del anterior lo reemplaza de inmediato", async () => {
    const mic = await abrirMicrofono();
    const analizador = ContextoFalso.ultimo!.analizador;
    analizador.valor = 0.02;
    mic.nivel();
    analizador.valor = 0.3;
    expect(mic.nivel()).toBeCloseTo(0.3, 6);
  });

  it("si el contexto de audio no arrancó, el nivel queda «sin medir» (NaN) y se intenta reanudarlo", async () => {
    ContextoFalso.estadoInicial = "suspended";
    const mic = await abrirMicrofono();
    expect(mic.nivel()).toBeNaN();
    expect(ContextoFalso.ultimo!.reanudado).toBeGreaterThan(1);
  });

  it("si no se puede crear el analizador, igual graba (nivel sin medir)", async () => {
    vi.stubGlobal("AudioContext", class { constructor() { throw new Error("sin audio"); } });
    const mic = await abrirMicrofono();
    expect(mic.nivel()).toBeNaN();
  });

  it("cerrar suelta las pistas y el contexto de audio", async () => {
    const mic = await abrirMicrofono();
    mic.cerrar();
    expect(flujo.pistas[0].detenida).toBe(true);
    expect(ContextoFalso.ultimo!.cerrado).toBe(true);
  });

  it("avisa si se pierde la pista (micrófono desconectado o permiso retirado)", async () => {
    const mic = await abrirMicrofono();
    const f = vi.fn();
    mic.alPerderse(f);
    flujo.pistas[0].escuchas.ended.forEach((x) => x());
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("listarMicrofonos", () => {
  it("solo entradas de audio con identificador, sin los alias «default» y «communications»", async () => {
    montarNavegador({
      dispositivos: [
        { kind: "audioinput", deviceId: "default", label: "Predeterminado" },
        { kind: "audioinput", deviceId: "communications", label: "Comunicaciones" },
        { kind: "audioinput", deviceId: "a1", label: "Micrófono USB" },
        { kind: "audioinput", deviceId: "a2", label: "" },
        { kind: "audiooutput", deviceId: "s1", label: "Altavoz" },
        { kind: "videoinput", deviceId: "v1", label: "Cámara" },
        { kind: "audioinput", deviceId: "", label: "Sin id" },
      ],
    });
    expect(await listarMicrofonos()).toEqual([{ id: "a1", etiqueta: "Micrófono USB" }, { id: "a2", etiqueta: "Micrófono 2" }]);
  });
  it("sin la API, una lista vacía", async () => {
    montarNavegador({ conMedia: false });
    expect(await listarMicrofonos()).toEqual([]);
  });
  it("si el navegador falla al listar, también", async () => {
    montarNavegador();
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockRejectedValue(new Error("x"));
    expect(await listarMicrofonos()).toEqual([]);
  });
});

describe("entornoDelNavegador", () => {
  it("dormir espera lo pedido y se corta con la señal", async () => {
    vi.useFakeTimers();
    try {
      const e = entornoDelNavegador();
      const control = new AbortController();
      let listo = false;
      void e.dormir(1000, control.signal).then(() => (listo = true));
      await vi.advanceTimersByTimeAsync(999);
      expect(listo).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(listo).toBe(true);

      const otra = new AbortController();
      const cortada = e.dormir(5000, otra.signal).then(() => "ok", (err) => (err as Error).name);
      otra.abort();
      expect(await cortada).toBe("AbortError");
      expect(await e.dormir(10, otra.signal).then(() => "ok", (err) => (err as Error).name)).toBe("AbortError");
    } finally {
      vi.useRealTimers();
    }
  });

  it("cada repite hasta que se cancela", async () => {
    vi.useFakeTimers();
    try {
      const f = vi.fn();
      const cancelar = entornoDelNavegador().cada(250, f);
      await vi.advanceTimersByTimeAsync(1000);
      expect(f).toHaveBeenCalledTimes(4);
      cancelar();
      await vi.advanceTimersByTimeAsync(1000);
      expect(f).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sin conexión espera al evento «online»; con conexión sigue de largo", async () => {
    const e = entornoDelNavegador();
    expect(e.hayConexion()).toBe(true);
    await e.esperarConexion(new AbortController().signal);

    vi.stubGlobal("navigator", { onLine: false });
    expect(e.hayConexion()).toBe(false);
    const escuchas: Record<string, () => void> = {};
    vi.stubGlobal("window", { addEventListener: (t: string, f: () => void) => { escuchas[t] = f; }, removeEventListener: vi.fn() });
    let volvio = false;
    void e.esperarConexion(new AbortController().signal).then(() => (volvio = true));
    await Promise.resolve();
    expect(volvio).toBe(false);
    escuchas.online();
    await Promise.resolve();
    expect(volvio).toBe(true);

    const control = new AbortController();
    const cortada = e.esperarConexion(control.signal).then(() => "ok", (err) => (err as Error).name);
    control.abort();
    expect(await cortada).toBe("AbortError");
  });

  it("el reloj de medir no depende de la hora del sistema", () => {
    const e = entornoDelNavegador();
    const a = e.ahora();
    expect(e.ahora()).toBeGreaterThanOrEqual(a);
    expect(Math.abs(e.epoca() - Date.now())).toBeLessThan(1000);
  });
});

describe("mantenerPantallaEncendida", () => {
  it("sin la API del navegador, avisa que no está soportado", () => {
    vi.stubGlobal("navigator", {});
    expect(mantenerPantallaEncendida().soportado).toBe(false);
  });

  it("pide el bloqueo, lo vuelve a pedir al regresar a la pestaña y lo suelta al terminar", async () => {
    const liberar = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release: liberar }));
    vi.stubGlobal("navigator", { wakeLock: { request } });
    const escuchas: Record<string, () => void> = {};
    const documento = { visibilityState: "visible", addEventListener: (t: string, f: () => void) => { escuchas[t] = f; }, removeEventListener: vi.fn() };
    vi.stubGlobal("document", documento);

    const bloqueo = mantenerPantallaEncendida();
    expect(bloqueo.soportado).toBe(true);
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith("screen");

    documento.visibilityState = "hidden";
    escuchas.visibilitychange();
    expect(request).toHaveBeenCalledTimes(1); // oculta: no se pide
    documento.visibilityState = "visible";
    escuchas.visibilitychange();
    expect(request).toHaveBeenCalledTimes(2);

    await Promise.resolve();
    bloqueo.soltar();
    expect(documento.removeEventListener).toHaveBeenCalled();
    expect(liberar).toHaveBeenCalled();
  });
});

describe("tomarCandado", () => {
  /** Un `navigator.locks` de mentira con la semántica de «ifAvailable». */
  function candadosFalsos() {
    const tomados = new Set<string>();
    return {
      request: (nombre: string, _opciones: unknown, fn: (c: { name: string } | null) => Promise<void> | undefined) => {
        if (tomados.has(nombre)) return Promise.resolve(fn(null));
        tomados.add(nombre);
        return Promise.resolve(fn({ name: nombre })).finally(() => tomados.delete(nombre));
      },
    };
  }

  it("el primero lo toma; el segundo no, hasta que el primero lo suelta", async () => {
    vi.stubGlobal("navigator", { locks: candadosFalsos() });
    const soltar = await tomarCandado("grabadora-m1");
    expect(soltar).toBeTypeOf("function");
    expect(await tomarCandado("grabadora-m1")).toBeNull();
    expect(await tomarCandado("grabadora-m2")).toBeTypeOf("function"); // otra reunión, otro candado
    soltar!();
    await Promise.resolve();
    await Promise.resolve();
    expect(await tomarCandado("grabadora-m1")).toBeTypeOf("function");
  });

  it("sin la API de candados siempre se concede", async () => {
    vi.stubGlobal("navigator", {});
    const soltar = await tomarCandado("x");
    expect(soltar).toBeTypeOf("function");
    expect(() => soltar!()).not.toThrow();
  });
});

describe("espacio del dispositivo", () => {
  it("lo que queda es la cuota menos lo usado, nunca negativo", async () => {
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ quota: 1000, usage: 400 }) } });
    expect(await espacioLibreEnDispositivo()).toBe(600);
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({ quota: 100, usage: 400 }) } });
    expect(await espacioLibreEnDispositivo()).toBe(0);
  });
  it("si el navegador no lo dice o falla, null", async () => {
    vi.stubGlobal("navigator", {});
    expect(await espacioLibreEnDispositivo()).toBeNull();
    vi.stubGlobal("navigator", { storage: { estimate: async () => ({}) } });
    expect(await espacioLibreEnDispositivo()).toBeNull();
    vi.stubGlobal("navigator", { storage: { estimate: async () => { throw new Error("x"); } } });
    expect(await espacioLibreEnDispositivo()).toBeNull();
  });
  it("pedir almacenamiento persistente no rompe sin la API ni si falla", () => {
    vi.stubGlobal("navigator", {});
    expect(() => pedirAlmacenamientoPersistente()).not.toThrow();
    const persist = vi.fn(async () => { throw new Error("no"); });
    vi.stubGlobal("navigator", { storage: { persist } });
    expect(() => pedirAlmacenamientoPersistente()).not.toThrow();
    expect(persist).toHaveBeenCalled();
  });
});
