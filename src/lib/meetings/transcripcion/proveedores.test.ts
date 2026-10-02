import { describe, expect, it, vi } from "vitest";
import { MP3_BYTES_POR_MS } from "../tipos";
import { crearProveedorDemo } from "./demo";
import { elegirProveedor } from "./elegir";
import {
  COSTO_USD_POR_MINUTO, MODELO_TRANSCRIPCION, aDataUrl, aErrorTranscripcion, armarCuerpo, crearProveedorOpenAI, leerRespuesta,
} from "./openai";
import { ErrorTranscripcion, type OpcionesDeTramo } from "./tipos";

const audio = (segundos: number) => new Uint8Array(segundos * 1000 * MP3_BYTES_POR_MS).fill(7);
const opciones = (parcial: Partial<OpcionesDeTramo> = {}): OpcionesDeTramo => ({
  referencias: [], desdeMs: 0, duracionMs: 60_000, timeoutMs: 150_000, ...parcial,
});
const conStatus = (status: number | undefined, message = "falló", code?: string) => Object.assign(new Error(message), { status, code });

describe("armarCuerpo", () => {
  it("pide la transcripción con hablantes, en español y con el corte automático", () => {
    const c = armarCuerpo(audio(5), []);
    expect(c).toMatchObject({ model: MODELO_TRANSCRIPCION, response_format: "diarized_json", chunking_strategy: "auto", language: "es" });
    expect(MODELO_TRANSCRIPCION).toBe("gpt-4o-transcribe-diarize");
    const f = c.file as File;
    expect(f.name).toBe("tramo.mp3");
    expect(f.type).toBe("audio/mpeg");
    expect(f.size).toBe(5 * 1000 * MP3_BYTES_POR_MS);
  });

  it("no manda lo que este modelo no admite", () => {
    const c = armarCuerpo(audio(5), []);
    for (const prohibido of ["prompt", "temperature", "timestamp_granularities", "include"]) expect(c).not.toHaveProperty(prohibido);
  });

  it("sin voces conocidas no manda ni los nombres ni las muestras", () => {
    const c = armarCuerpo(audio(5), []);
    expect(c).not.toHaveProperty("known_speaker_names");
    expect(c).not.toHaveProperty("known_speaker_references");
  });

  it("con voces conocidas manda los nombres y las muestras como data URL, en el mismo orden", () => {
    const c = armarCuerpo(audio(5), [
      { nombre: "V1", audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" },
      { nombre: "V2", audio: new Uint8Array([4, 5, 6, 7]), mime: "audio/mpeg" },
    ]);
    expect(c.known_speaker_names).toEqual(["V1", "V2"]);
    expect(c.known_speaker_references).toEqual(["data:audio/mpeg;base64,AQID", "data:audio/mpeg;base64,BAUGBw=="]);
  });

  it("aDataUrl respeta el desplazamiento de un recorte de un buffer más grande", () => {
    const grande = new Uint8Array([9, 9, 1, 2, 3, 9]);
    expect(aDataUrl(grande.subarray(2, 5), "audio/mpeg")).toBe("data:audio/mpeg;base64,AQID");
  });
});

describe("leerRespuesta", () => {
  it("convierte segundos en milisegundos y conserva la etiqueta y el texto", () => {
    const r = leerRespuesta({
      text: "…",
      segments: [
        { id: "seg_1", start: 0.5, end: 4.25, speaker: "A", text: " Buenas noches. " },
        { id: "seg_2", start: 4.25, end: 9, speaker: "V1", text: "Gracias." },
      ],
    });
    expect(r).toEqual([
      { inicioMs: 500, finMs: 4_250, hablante: "A", texto: "Buenas noches." },
      { inicioMs: 4_250, finMs: 9_000, hablante: "V1", texto: "Gracias." },
    ]);
  });

  it("un tramo sin voz (sin segmentos ni texto) es válido y no tiene intervenciones", () => {
    expect(leerRespuesta({ text: "", segments: [] })).toEqual([]);
    expect(leerRespuesta({ text: "  " })).toEqual([]);
  });

  it("si trae texto pero no segmentos, no sirve (no hay a quién ni cuándo atribuirlo) y se reintenta", () => {
    try {
      leerRespuesta({ text: "algo dicho" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorTranscripcion);
      expect((e as ErrorTranscripcion).reintentable).toBe(true);
    }
    expect(() => leerRespuesta(null)).toThrow(ErrorTranscripcion);
  });

  it("descarta lo que no cuadra: sin texto, sin tiempos o con tiempos que no son números", () => {
    const r = leerRespuesta({
      segments: [
        { start: 0, end: 1, speaker: "A", text: "   " },
        { start: "0", end: 1, speaker: "A", text: "mal" },
        { start: 1, end: Number.NaN, speaker: "A", text: "nan" },
        { start: 2, end: 3, speaker: "B", text: "bien" },
        null,
        "texto suelto",
      ],
    });
    expect(r).toEqual([{ inicioMs: 2_000, finMs: 3_000, hablante: "B", texto: "bien" }]);
  });

  it("sin etiqueta de hablante usa «?» (la unión la tratará como una voz sin pareja) y no deja el final antes del inicio", () => {
    const [s] = leerRespuesta({ segments: [{ start: 5, end: 4, speaker: "", text: "hola" }] });
    expect(s.hablante).toBe("?");
    expect(s.finMs).toBeGreaterThanOrEqual(s.inicioMs);
  });
});

describe("aErrorTranscripcion", () => {
  const caso = (e: unknown) => {
    const r = aErrorTranscripcion(e);
    return [r.reintentable, r.message] as const;
  };

  it("los fallos del momento se reintentan: sin respuesta, tiempo agotado, saturación, caída", () => {
    expect(caso(conStatus(undefined, "Connection error."))[0]).toBe(true);
    expect(caso(conStatus(408))[0]).toBe(true);
    expect(caso(conStatus(409))[0]).toBe(true);
    expect(caso(conStatus(429, "Rate limit reached", "rate_limit_exceeded"))[0]).toBe(true);
    expect(caso(conStatus(500))[0]).toBe(true);
    expect(caso(conStatus(503))[0]).toBe(true);
    expect(caso(new Error("algo raro"))[0]).toBe(true);
    expect(caso("texto")[0]).toBe(true);
  });

  it("lo que no se arregla reintentando no se reintenta: clave, cuenta, modelo, audio rechazado", () => {
    expect(caso(conStatus(401))[0]).toBe(false);
    expect(caso(conStatus(403))[0]).toBe(false);
    expect(caso(conStatus(404))[0]).toBe(false);
    expect(caso(conStatus(429, "You exceeded your current quota", "insufficient_quota"))[0]).toBe(false);
    expect(caso(conStatus(400, "Audio file is too short"))[0]).toBe(false);
    expect(caso(conStatus(413))[0]).toBe(false);
    expect(caso(conStatus(415))[0]).toBe(false);
  });

  it("los mensajes están en español y no filtran más de lo necesario", () => {
    expect(caso(conStatus(401))[1]).toMatch(/^No pudimos transcribir/);
    expect(caso(conStatus(429, "x", "insufficient_quota"))[1]).toMatch(/saldo/);
    expect(caso(conStatus(400, "Audio file is too short"))[1]).toMatch(/rechazó este tramo/);
    const largo = aErrorTranscripcion(conStatus(400, "x".repeat(500)));
    expect(largo.message.length).toBeLessThan(300);
  });

  it("un ErrorTranscripcion ya clasificado pasa tal cual", () => {
    const propio = new ErrorTranscripcion("listo", { reintentable: false });
    expect(aErrorTranscripcion(propio)).toBe(propio);
  });
});

describe("crearProveedorOpenAI", () => {
  it("llama una vez con el cuerpo, el tiempo máximo y sin reintentos del SDK, y devuelve los segmentos", async () => {
    const crear = vi.fn(async () => ({ segments: [{ start: 1, end: 2, speaker: "A", text: "hola" }] }));
    const p = crearProveedorOpenAI({ crear });
    const senal = new AbortController().signal;
    const r = await p.transcribirTramo(audio(30), opciones({ timeoutMs: 120_000, senal }));
    expect(r).toEqual([{ inicioMs: 1_000, finMs: 2_000, hablante: "A", texto: "hola" }]);
    expect(crear).toHaveBeenCalledTimes(1);
    const [cuerpo, o] = crear.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(cuerpo.model).toBe(MODELO_TRANSCRIPCION);
    expect(o).toEqual({ timeout: 120_000, signal: senal, maxRetries: 0 });
  });

  it("manda como mucho cuatro voces conocidas", async () => {
    const crear = vi.fn(async () => ({ segments: [] }));
    const p = crearProveedorOpenAI({ crear });
    const voces = Array.from({ length: 6 }, (_, k) => ({ nombre: `V${k + 1}`, audio: new Uint8Array([k]), mime: "audio/mpeg" }));
    await p.transcribirTramo(audio(30), opciones({ referencias: voces }));
    const [cuerpo] = crear.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(cuerpo.known_speaker_names).toEqual(["V1", "V2", "V3", "V4"]);
  });

  it("un recorte de menos de un segundo no se manda (no hay nada que transcribir)", async () => {
    const crear = vi.fn(async () => ({ segments: [{ start: 0, end: 1, speaker: "A", text: "no debería" }] }));
    const p = crearProveedorOpenAI({ crear });
    expect(await p.transcribirTramo(audio(0.5), opciones())).toEqual([]);
    expect(crear).not.toHaveBeenCalled();
  });

  it("clasifica los fallos de la llamada", async () => {
    const p = crearProveedorOpenAI({ crear: async () => { throw conStatus(503); } });
    await expect(p.transcribirTramo(audio(30), opciones())).rejects.toMatchObject({ name: "ErrorTranscripcion", reintentable: true });
    const q = crearProveedorOpenAI({ crear: async () => { throw conStatus(401); } });
    await expect(q.transcribirTramo(audio(30), opciones())).rejects.toMatchObject({ reintentable: false });
  });

  describe("si el servicio rechaza las voces de referencia", () => {
    const voces = [{ nombre: "V1", audio: new Uint8Array([1, 2, 3]), mime: "audio/mpeg" }];
    const buena = { segments: [{ start: 1, end: 2, speaker: "A", text: "sin voces" }] };

    it("transcribe el tramo otra vez SIN ellas, en vez de dejar la reunión en error", async () => {
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
      const crear = vi.fn(async (cuerpo: Record<string, unknown>) => {
        if (cuerpo.known_speaker_references) throw conStatus(400, "Invalid audio sample duration");
        return buena;
      });
      const r = await crearProveedorOpenAI({ crear }).transcribirTramo(audio(30), opciones({ referencias: voces }));
      expect(r).toEqual([{ inicioMs: 1_000, finMs: 2_000, hablante: "A", texto: "sin voces" }]);
      expect(crear).toHaveBeenCalledTimes(2);
      expect(crear.mock.calls[0][0]).toHaveProperty("known_speaker_references");
      expect(crear.mock.calls[1][0]).not.toHaveProperty("known_speaker_references");
      expect(crear.mock.calls[1][0]).not.toHaveProperty("known_speaker_names");
      expect(aviso).toHaveBeenCalledTimes(1);
      aviso.mockRestore();
    });

    it("también con un 413, 415 o 422", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      for (const status of [413, 415, 422]) {
        const crear = vi.fn(async (cuerpo: Record<string, unknown>) => {
          if (cuerpo.known_speaker_references) throw conStatus(status);
          return buena;
        });
        expect(await crearProveedorOpenAI({ crear }).transcribirTramo(audio(30), opciones({ referencias: voces }))).toHaveLength(1);
      }
      vi.restoreAllMocks();
    });

    it("no lo hace por un fallo que no es de la muestra: saturación, caída, clave o cuenta", async () => {
      for (const status of [429, 500, 503, 401, 403, 404]) {
        const crear = vi.fn(async () => {
          throw conStatus(status);
        });
        await expect(crearProveedorOpenAI({ crear }).transcribirTramo(audio(30), opciones({ referencias: voces }))).rejects.toBeInstanceOf(ErrorTranscripcion);
        expect(crear, String(status)).toHaveBeenCalledTimes(1);
      }
    });

    it("sin voces conocidas un 400 es un rechazo del audio y no se repite", async () => {
      const crear = vi.fn(async () => {
        throw conStatus(400, "Audio file is too short");
      });
      await expect(crearProveedorOpenAI({ crear }).transcribirTramo(audio(30), opciones())).rejects.toMatchObject({ reintentable: false });
      expect(crear).toHaveBeenCalledTimes(1);
    });

    it("si sin las voces también falla, el error es el de esa segunda llamada", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      let llamadas = 0;
      const crear = vi.fn(async () => {
        llamadas++;
        throw llamadas === 1 ? conStatus(400, "muestra") : conStatus(503, "caído");
      });
      await expect(crearProveedorOpenAI({ crear }).transcribirTramo(audio(30), opciones({ referencias: voces }))).rejects.toMatchObject({ reintentable: true });
      expect(crear).toHaveBeenCalledTimes(2);
      vi.restoreAllMocks();
    });
  });

  it("sin clave ni llamada inyectada falla sin reintentar, con un mensaje claro", async () => {
    const p = crearProveedorOpenAI({});
    await expect(p.transcribirTramo(audio(30), opciones())).rejects.toMatchObject({ reintentable: false, message: expect.stringContaining("no está configurado") });
  });

  it("es el proveedor de tramos de 10 min con 30 s de solape, y su costo es por minuto", () => {
    const p = crearProveedorOpenAI({ crear: async () => ({}) });
    expect([p.nombre, p.modo, p.tramoMs, p.solapeMs, p.costoUsdPorMinuto]).toEqual(["openai", "tramos", 600_000, 30_000, COSTO_USD_POR_MINUTO]);
  });
});

describe("crearProveedorDemo", () => {
  it("responde con las intervenciones del guion que caen en el audio pedido, con tiempos relativos y recortadas en los bordes", async () => {
    const p = crearProveedorDemo();
    const r = await p.transcribirTramo(new Uint8Array(0), opciones({ desdeMs: 60_000, duracionMs: 600_000 }));
    expect(r.length).toBeGreaterThan(3);
    for (const s of r) {
      expect(s.inicioMs).toBeGreaterThanOrEqual(0);
      expect(s.finMs).toBeLessThanOrEqual(600_000);
      expect(s.finMs).toBeGreaterThan(s.inicioMs);
      expect(s.hablante).toMatch(/^[A-Z]$/);
    }
  });

  it("un audio donde nadie habla da una lista vacía", async () => {
    const p = crearProveedorDemo();
    expect(await p.transcribirTramo(new Uint8Array(0), opciones({ desdeMs: 0, duracionMs: 1_000 }))).toEqual([]);
  });
});

describe("elegirProveedor", () => {
  it("por defecto es OpenAI", () => {
    expect(elegirProveedor({ OPENAI_API_KEY: "sk-x" }).nombre).toBe("openai");
    expect(elegirProveedor({ OPENAI_API_KEY: "sk-x", TRANSCRIPCION_PROVEEDOR: "openai" }).nombre).toBe("openai");
  });

  it("en modo demo usa el proveedor de ejemplo", () => {
    expect(elegirProveedor({ DEMO_MODE: "true" }).nombre).toBe("demo");
  });

  it("AssemblyAI todavía no existe: avisa y sigue con OpenAI; un nombre desconocido también", () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(elegirProveedor({ TRANSCRIPCION_PROVEEDOR: "AssemblyAI", ASSEMBLYAI_API_KEY: "k" }).nombre).toBe("openai");
    expect(elegirProveedor({ TRANSCRIPCION_PROVEEDOR: "otro" }).nombre).toBe("openai");
    expect(aviso).toHaveBeenCalledTimes(2);
    aviso.mockRestore();
  });
});
