import { describe, expect, it, vi } from "vitest";
import {
  AVISO_SILENCIO_MS, AlmacenGrabacionesEnMemoria, ErrorGrabacion, SIN_DATOS_MS, UMBRAL_SILENCIO, crearGrabadora, esperaDeReintentoVivo,
  type ApiGrabacion, type CierreSesion, type EntornoGrabadora, type GrabadorLike, type MicrofonoAbierto, type RespuestaCierre,
} from "./grabadora";
import { VIVO_TROZO_MS } from "./tipos";

const MIME = "audio/webm;codecs=opus";

/* ════════════════════════════════════════════════════════════════════
   Entorno de mentira: el tiempo solo pasa cuando la prueba lo dice
   ════════════════════════════════════════════════════════════════════ */

const errorDeAborto = () => new DOMException("Aborted", "AbortError");

/** Deja correr todo lo pendiente (promesas encadenadas, lecturas de Blob) sin mover el reloj. */
const asentar = async () => {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => setImmediate(r));
};

function entornoFalso() {
  let t = 1_000_000;
  let enLinea = true;
  const dormidos: Array<{ en: number; resolver: () => void }> = [];
  const esperandoRed: Array<() => void> = [];
  const intervalos: Array<{ cada: number; proximo: number; fn: () => void; vivo: boolean }> = [];

  const entorno: EntornoGrabadora = {
    ahora: () => t,
    dormir: (ms, senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (senal.aborted) return rechazar(errorDeAborto());
        const d = { en: t + ms, resolver };
        dormidos.push(d);
        senal.addEventListener("abort", () => {
          const i = dormidos.indexOf(d);
          if (i >= 0) dormidos.splice(i, 1);
          rechazar(errorDeAborto());
        }, { once: true });
      }),
    hayConexion: () => enLinea,
    esperarConexion: (senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (enLinea) return resolver();
        if (senal.aborted) return rechazar(errorDeAborto());
        const r = () => resolver();
        esperandoRed.push(r);
        senal.addEventListener("abort", () => {
          const i = esperandoRed.indexOf(r);
          if (i >= 0) esperandoRed.splice(i, 1);
          rechazar(errorDeAborto());
        }, { once: true });
      }),
    cada: (ms, fn) => {
      const it = { cada: ms, proximo: t + ms, fn, vivo: true };
      intervalos.push(it);
      return () => {
        it.vivo = false;
      };
    },
  };

  /** Hace pasar `ms` de reloj, de a 250 ms (como el temporizador real de la grabadora). */
  async function avanzar(ms: number) {
    let resto = ms;
    while (resto > 0) {
      const paso = Math.min(resto, 250);
      t += paso;
      resto -= paso;
      for (const d of dormidos.filter((x) => x.en <= t)) {
        dormidos.splice(dormidos.indexOf(d), 1);
        d.resolver();
      }
      for (const it of intervalos) {
        if (it.vivo && t >= it.proximo) {
          it.proximo += it.cada;
          it.fn();
        }
      }
      await asentar();
    }
  }

  return {
    entorno,
    avanzar,
    conexion: (v: boolean) => {
      enLinea = v;
      if (v) esperandoRed.splice(0).forEach((r) => r());
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Micrófono de mentira: entrega trozos y termina como MediaRecorder (último trozo y luego «stop»)
   ════════════════════════════════════════════════════════════════════ */

class GrabadorFalso implements GrabadorLike {
  state: GrabadorLike["state"] = "inactive";
  ondataavailable: GrabadorLike["ondataavailable"] = null;
  onstop: GrabadorLike["onstop"] = null;
  onerror: GrabadorLike["onerror"] = null;
  /** Lo que `stop()` entrega como último trozo. */
  restante: Uint8Array | null = null;
  inicios: number[] = [];
  noPuedeEmpezar = false;
  nuncaParaDeVerdad = false;

  start(ms: number) {
    if (this.noPuedeEmpezar) throw new Error("No se pudo iniciar");
    this.state = "recording";
    this.inicios.push(ms);
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    if (this.restante) this.ondataavailable?.({ data: new Blob([this.restante as BlobPart]) });
    this.restante = null;
    this.state = "inactive";
    if (!this.nuncaParaDeVerdad) queueMicrotask(() => this.onstop?.());
  }
  trozo(bytes: Uint8Array) {
    this.ondataavailable?.({ data: new Blob([bytes as BlobPart]) });
  }
}

function micFalso(opciones: { noPuedeEmpezar?: boolean } = {}) {
  const grabador = new GrabadorFalso();
  grabador.noPuedeEmpezar = opciones.noPuedeEmpezar ?? false;
  let nivel = 0.05;
  let alPerderse: (() => void) | null = null;
  const m = {
    grabador,
    cerrado: false,
    emitidos: 0,
    perder: () => alPerderse?.(),
    ponerNivel: (n: number) => {
      nivel = n;
    },
    mic: {
      grabador,
      mime: MIME,
      nivel: () => nivel,
      cerrar: () => {
        m.cerrado = true;
      },
      alPerderse: (f: () => void) => {
        alPerderse = f;
      },
    } satisfies MicrofonoAbierto,
  };
  return m;
}

/* ════════════════════════════════════════════════════════════════════
   Servidor de mentira
   ════════════════════════════════════════════════════════════════════ */

type ParteRecibida = { session: number; seq: number; durMs: number; mime: string; bytes: Uint8Array };

function servidorFalso() {
  const partes = new Map<string, ParteRecibida>();
  const reservadas = new Set<number>();
  const marcas: Array<{ id: string; atMs: number; kind: string; note: string | null }> = [];
  const llamadas = { nuevaSesion: 0, subir: [] as string[], marcar: 0, cerrar: [] as CierreSesion[][] };
  const guion = {
    sesion: "auto" as "auto" | "falla" | "colgada",
    erroresParte: [] as unknown[],
    erroresMarca: [] as unknown[],
    cierres: [] as Array<RespuestaCierre | Error>,
  };

  const api: ApiGrabacion = {
    async nuevaSesion() {
      llamadas.nuevaSesion++;
      if (guion.sesion === "falla") throw new Error("Failed to fetch");
      if (guion.sesion === "colgada") return new Promise<never>(() => {});
      const session = Math.max(0, ...reservadas, ...[...partes.values()].map((p) => p.session)) + 1;
      reservadas.add(session);
      const offsetMs = [...partes.values()].filter((p) => p.session < session).reduce((suma, p) => suma + p.durMs, 0);
      return { session, offsetMs };
    },
    async subirParte(d, senal) {
      llamadas.subir.push(`${d.session}:${d.seq}`);
      if (senal.aborted) throw errorDeAborto();
      const e = guion.erroresParte.shift();
      if (e) throw e;
      partes.set(`${d.session}:${d.seq}`, {
        session: d.session, seq: d.seq, durMs: d.durMs, mime: d.mime, bytes: new Uint8Array(await d.cuerpo.arrayBuffer()),
      });
    },
    async marcar(d) {
      llamadas.marcar++;
      const e = guion.erroresMarca.shift();
      if (e) throw e;
      if (!marcas.some((m) => m.id === d.id)) marcas.push(d);
    },
    async cerrar(d) {
      llamadas.cerrar.push(d.sesiones);
      const r = guion.cierres.shift();
      if (r instanceof Error) throw r;
      return r ?? { ok: true, status: "en_cola" };
    },
  };

  return {
    api, partes, marcas, llamadas, guion,
    secuencias: (session: number) => [...partes.values()].filter((p) => p.session === session).map((p) => p.seq).sort((a, b) => a - b),
  };
}

/* ════════════════════════════════════════════════════════════════════
   Armado de cada prueba
   ════════════════════════════════════════════════════════════════════ */

type Contexto = ReturnType<typeof montar>;

function montar(opciones: { almacen?: AlmacenGrabacionesEnMemoria; meetingId?: string; micFalla?: Error; micNoPuedeEmpezar?: boolean } = {}) {
  const meetingId = opciones.meetingId ?? "reunion-1";
  const almacen = opciones.almacen ?? new AlmacenGrabacionesEnMemoria();
  const servidor = servidorFalso();
  const reloj = entornoFalso();
  const mics: Array<ReturnType<typeof micFalso>> = [];
  const abrir = vi.fn(async () => {
    if (opciones.micFalla) throw opciones.micFalla;
    const m = micFalso({ noPuedeEmpezar: opciones.micNoPuedeEmpezar });
    mics.push(m);
    return m.mic;
  });
  const g = crearGrabadora({ meetingId, almacen, api: servidor.api, entorno: reloj.entorno, abrir });
  return { g, almacen, servidor, reloj, mics, abrir, meetingId, mic: () => mics[mics.length - 1] };
}

/** Simula `n` trozos de 5 s: pasa el tiempo y el grabador entrega cada uno (con bytes distintos por trozo). */
async function grabar(c: Contexto, n: number, bytesPorTrozo = 1000): Promise<Uint8Array[]> {
  const mic = c.mic();
  const salida: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    await c.reloj.avanzar(VIVO_TROZO_MS);
    mic.emitidos++;
    const bytes = new Uint8Array(bytesPorTrozo).fill(mic.emitidos % 251);
    mic.grabador.trozo(bytes);
    salida.push(bytes);
    await asentar();
  }
  return salida;
}

function unir(trozos: Uint8Array[]): Uint8Array {
  const salida = new Uint8Array(trozos.reduce((suma, t) => suma + t.length, 0));
  let pos = 0;
  for (const t of trozos) {
    salida.set(t, pos);
    pos += t.length;
  }
  return salida;
}

/** Deja en el almacén una sesión como la que queda tras cerrar el navegador a mitad de una grabación. */
async function sesionAbandonada(
  almacen: AlmacenGrabacionesEnMemoria,
  o: { meetingId?: string; session?: number; idxGuardados: number[]; ultimoIdxAnotado: number; cerrada?: boolean; durMs?: number },
) {
  const meetingId = o.meetingId ?? "reunion-1";
  const session = o.session ?? 1;
  const trozos: Record<number, Uint8Array> = {};
  for (const idx of o.idxGuardados) {
    trozos[idx] = new Uint8Array(1000).fill(idx + 1);
    await almacen.guardarTrozo({ meetingId, session, idx, datos: trozos[idx].buffer.slice(0) as ArrayBuffer, durMs: VIVO_TROZO_MS });
  }
  await almacen.guardarSesion({
    meetingId, session, mime: MIME, iniciada: 1, cerrada: o.cerrada ?? false, ultimoIdx: o.ultimoIdxAnotado, enviadas: [],
    durMs: o.durMs ?? (o.ultimoIdxAnotado + 1) * VIVO_TROZO_MS, bytes: (o.ultimoIdxAnotado + 1) * 1000, offsetMs: 0,
  });
  return trozos;
}

/* ════════════════════════════════════════════════════════════════════
   Pruebas
   ════════════════════════════════════════════════════════════════════ */

describe("grabadora · partes", () => {
  it("sube partes de seis trozos, en orden, y al terminar manda la última incompleta", async () => {
    const c = montar();
    await c.g.iniciar();
    expect(c.g.estado()).toMatchObject({ fase: "grabando", session: 1 });
    expect(c.mic().grabador.inicios).toEqual([VIVO_TROZO_MS]);

    const trozos = await grabar(c, 13); // 65 s
    // Dos partes completas (trozos 0-5 y 6-11). El trozo 12 espera a completar la tercera.
    expect(c.servidor.secuencias(1)).toEqual([0, 1]);
    expect(c.servidor.partes.get("1:0")!.bytes).toEqual(unir(trozos.slice(0, 6)));
    expect(c.servidor.partes.get("1:1")!.bytes).toEqual(unir(trozos.slice(6, 12)));
    expect(c.servidor.partes.get("1:0")!.durMs).toBe(30_000);
    expect(c.g.estado().subidoHastaMs).toBe(60_000);
    expect(c.g.estado().partesPendientes).toBe(0);

    await c.reloj.avanzar(2000);
    c.mic().grabador.restante = new Uint8Array(500).fill(99);
    const r = await c.g.terminar();
    expect(r).toEqual({ ok: true, status: "en_cola" });
    expect(c.servidor.secuencias(1)).toEqual([0, 1, 2]);
    expect(c.servidor.partes.get("1:2")!.bytes).toEqual(unir([trozos[12], new Uint8Array(500).fill(99)]));
    expect(c.servidor.partes.get("1:2")!.durMs).toBe(7000);
    expect(c.servidor.llamadas.cerrar).toEqual([[{ session: 1, ultimaSecuencia: 2, mimeType: MIME, duracionMs: 67_000 }]]);
    expect(c.g.estado().fase).toBe("terminada");
    expect(await c.almacen.listarSesiones(c.meetingId)).toEqual([]); // ya está en el servidor: se libera el dispositivo
    expect(c.mic().cerrado).toBe(true);
  });

  it("ignora los trozos vacíos que algunos navegadores entregan", async () => {
    const c = montar();
    await c.g.iniciar();
    c.mic().grabador.trozo(new Uint8Array(0));
    await asentar();
    expect(await c.almacen.ultimoTrozo(c.meetingId, 1)).toBe(-1);
  });

  it("pedir iniciar dos veces seguidas abre un solo micrófono", async () => {
    const c = montar();
    await Promise.all([c.g.iniciar(), c.g.iniciar()]);
    expect(c.abrir).toHaveBeenCalledTimes(1);
  });

  it("terminar sin haber grabado nada lo dice con claridad y no molesta al servidor", async () => {
    const c = montar();
    await c.g.iniciar();
    const r = await c.g.terminar();
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/No se grabó nada/) });
    expect(c.servidor.llamadas.cerrar).toEqual([]);
  });
});

describe("grabadora · sin internet", () => {
  it("sigue grabando en el dispositivo y sube todo, en orden, cuando vuelve la conexión", async () => {
    const c = montar();
    await c.g.iniciar();
    c.reloj.conexion(false);
    const trozos = await grabar(c, 13);
    expect(c.servidor.llamadas.subir).toEqual([]);
    expect(c.g.estado()).toMatchObject({ fase: "grabando", sinConexion: true, partesPendientes: 2 });
    expect(await c.almacen.ultimoTrozo(c.meetingId, 1)).toBe(12); // todo quedó guardado aquí

    c.reloj.conexion(true);
    await asentar();
    expect(c.servidor.llamadas.subir).toEqual(["1:0", "1:1"]);
    expect(c.servidor.partes.get("1:0")!.bytes).toEqual(unir(trozos.slice(0, 6)));
    expect(c.g.estado()).toMatchObject({ sinConexion: false, partesPendientes: 0 });
  });

  it("los fallos pasajeros se reintentan sin límite, con una espera que crece", async () => {
    const c = montar();
    c.servidor.guion.erroresParte.push(new Error("Failed to fetch"), new Error("503"));
    await c.g.iniciar();
    await grabar(c, 6);
    expect(c.servidor.llamadas.subir).toEqual(["1:0"]);

    await c.reloj.avanzar(esperaDeReintentoVivo(1) - 250);
    expect(c.servidor.llamadas.subir).toEqual(["1:0"]); // todavía esperando
    await c.reloj.avanzar(250);
    expect(c.servidor.llamadas.subir).toEqual(["1:0", "1:0"]);
    await c.reloj.avanzar(esperaDeReintentoVivo(2));
    expect(c.servidor.llamadas.subir).toEqual(["1:0", "1:0", "1:0"]);
    expect(c.servidor.secuencias(1)).toEqual([0]);
    expect(c.g.estado().errorEnvio).toBeNull();
  });

  it("un rechazo definitivo se muestra, no frena la grabación y se reintenta a pedido", async () => {
    const c = montar();
    c.servidor.guion.erroresParte.push(new ErrorGrabacion("Esta reunión ya no acepta grabaciones.", "fatal"));
    await c.g.iniciar();
    await grabar(c, 13);
    expect(c.g.estado()).toMatchObject({ fase: "grabando", errorEnvio: "Esta reunión ya no acepta grabaciones." });
    expect(c.servidor.llamadas.subir).toEqual(["1:0"]); // no insiste solo

    c.g.reintentarEnvios();
    await asentar();
    expect(c.servidor.llamadas.subir).toEqual(["1:0", "1:0", "1:1"]);
    expect(c.g.estado().errorEnvio).toBeNull();
  });

  it("la espera crece hasta un tope de 30 segundos", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(esperaDeReintentoVivo)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
});

describe("grabadora · pausa, silencio y avisos", () => {
  it("la pausa no cuenta como tiempo grabado", async () => {
    const c = montar();
    await c.g.iniciar();
    await c.reloj.avanzar(10_000);
    c.g.pausar();
    expect(c.g.estado().fase).toBe("pausada");
    expect(c.mic().grabador.state).toBe("paused");
    await c.reloj.avanzar(60_000);
    expect(c.g.estado()).toMatchObject({ transcurridoMs: 10_000, sinDatos: false });

    c.g.reanudar();
    expect(c.mic().grabador.state).toBe("recording");
    await c.reloj.avanzar(5_000);
    expect(c.g.estado().transcurridoMs).toBe(15_000);
  });

  it("cuenta el silencio seguido y lo reinicia con sonido o con una pausa", async () => {
    const c = montar();
    await c.g.iniciar();
    c.mic().ponerNivel(UMBRAL_SILENCIO / 2);
    await grabar(c, 12); // 60 s
    expect(c.g.estado().silencioMs).toBe(60_000);
    await grabar(c, 12);
    expect(c.g.estado().silencioMs).toBeGreaterThanOrEqual(AVISO_SILENCIO_MS);

    c.g.pausar();
    expect(c.g.estado().silencioMs).toBe(0);
    await c.reloj.avanzar(10_000); // en pausa no se acumula
    expect(c.g.estado().silencioMs).toBe(0);

    c.g.reanudar();
    c.mic().ponerNivel(0.05);
    await c.reloj.avanzar(500);
    expect(c.g.estado().silencioMs).toBe(0);
  });

  it("avisa si el micrófono deja de entregar datos y lo quita al volver", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 1);
    await c.reloj.avanzar(SIN_DATOS_MS - 250);
    expect(c.g.estado().sinDatos).toBe(false);
    await c.reloj.avanzar(500);
    expect(c.g.estado().sinDatos).toBe(true);
    expect(c.g.estado().mensaje).toMatch(/No llegan datos del micrófono/);

    await grabar(c, 1);
    await c.reloj.avanzar(250);
    expect(c.g.estado()).toMatchObject({ sinDatos: false, mensaje: null });
  });
});

describe("grabadora · marcas", () => {
  it("llevan el minuto de la reunión y se reintentan si falla el envío", async () => {
    const c = montar();
    c.servidor.guion.erroresMarca.push(new Error("Failed to fetch"));
    await c.g.iniciar();
    await c.reloj.avanzar(12_000);
    await c.g.marcar("tema", "Presupuesto 2026");
    await asentar();
    expect(c.servidor.marcas).toEqual([]);
    expect(c.g.estado().marcas).toBe(1);
    expect(await c.almacen.listarMarcas(c.meetingId)).toEqual([
      expect.objectContaining({ atMs: 12_000, kind: "tema", note: "Presupuesto 2026", enviada: false }),
    ]);

    await grabar(c, 1); // el próximo trozo vuelve a intentarlo
    expect(c.servidor.marcas).toEqual([expect.objectContaining({ atMs: 12_000, kind: "tema", note: "Presupuesto 2026" })]);
    expect(await c.almacen.listarMarcas(c.meetingId)).toEqual([expect.objectContaining({ enviada: true })]);
  });

  it("una marca que el servidor rechaza se descarta en vez de reintentarse para siempre", async () => {
    const c = montar();
    c.servidor.guion.erroresMarca.push(new ErrorGrabacion("Tipo de marca no válido.", "fatal"));
    await c.g.iniciar();
    await c.g.marcar("raro");
    await asentar();
    await grabar(c, 1);
    expect(c.servidor.llamadas.marcar).toBe(1);
  });

  it("las de una sesión posterior suman lo grabado antes", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 4); // 20 s
    c.mic().perder();
    await asentar();
    expect(c.g.estado().fase).toBe("interrumpida");

    await c.g.iniciar();
    expect(c.g.estado().session).toBe(2);
    await c.reloj.avanzar(3000);
    await c.g.marcar("votacion");
    await asentar();
    expect(c.servidor.marcas.map((m) => m.atMs)).toEqual([23_000]);
  });

  it("no se pueden poner marcas si no se está grabando", async () => {
    const c = montar();
    await c.g.marcar("tema");
    expect(c.g.estado().marcas).toBe(0);
    expect(await c.almacen.listarMarcas(c.meetingId)).toEqual([]);
  });

  it("las que quedaron sin enviar al terminar se mandan antes de liberar el dispositivo", async () => {
    const c = montar();
    c.servidor.guion.erroresMarca.push(new Error("Failed to fetch"));
    await c.g.iniciar();
    await grabar(c, 2);
    await c.g.marcar("compromiso", "Enviar cotizaciones");
    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.marcas).toEqual([expect.objectContaining({ kind: "compromiso", note: "Enviar cotizaciones" })]);
  });
});

describe("grabadora · cortes del micrófono y del navegador", () => {
  it("si el micrófono falla, conserva lo grabado, avisa y permite continuar en una sesión nueva", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 3);
    c.mic().grabador.onerror?.(new Error("boom"));
    await asentar();
    expect(c.g.estado()).toMatchObject({ fase: "interrumpida", mensaje: expect.stringMatching(/error del micrófono/) });
    expect(c.mic().cerrado).toBe(true);
    expect(c.servidor.secuencias(1)).toEqual([0]); // los 3 trozos se suben igual

    await c.g.iniciar();
    expect(c.g.estado()).toMatchObject({ fase: "grabando", session: 2 });
    expect(c.abrir).toHaveBeenCalledTimes(2);
  });

  it("si el micrófono se desconecta lo dice, sin perder lo que ya estaba", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 2);
    c.mic().perder();
    await asentar();
    expect(c.g.estado()).toMatchObject({ fase: "interrumpida", mensaje: "El micrófono se desconectó." });
    expect(await c.almacen.ultimoTrozo(c.meetingId, 1)).toBe(1);
  });

  it("si el micrófono se pierde justo al pulsar «Terminar», no se pisan", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 7);
    const fin = c.g.terminar();
    c.mic().perder(); // llega durante el cierre
    const r = await fin;
    expect(r.ok).toBe(true);
    expect(c.g.estado().fase).toBe("terminada");
  });

  it("si se pierde y enseguida se pulsa «Terminar», se cierra con lo grabado", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 7);
    c.mic().perder();
    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.secuencias(1)).toEqual([0, 1]);
  });

  it("si el micrófono no abre, lo explica y no deja una sesión a medias", async () => {
    const c = montar({ micFalla: new Error("Permiso del micrófono denegado.") });
    await c.g.iniciar();
    expect(c.g.estado()).toMatchObject({ fase: "error", mensaje: "Permiso del micrófono denegado." });
    expect(await c.almacen.listarSesiones(c.meetingId)).toEqual([]);
  });

  it("si el grabador no puede empezar, suelta el micrófono y borra la sesión vacía", async () => {
    const c = montar({ micNoPuedeEmpezar: true });
    await c.g.iniciar();
    expect(c.g.estado()).toMatchObject({ fase: "error", mensaje: "No se pudo iniciar" });
    expect(c.mic().cerrado).toBe(true);
    expect(await c.almacen.listarSesiones(c.meetingId)).toEqual([]);
  });

  it("si el grabador nunca avisa que paró, sigue con lo que ya tiene tras unos segundos", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 6);
    c.mic().grabador.nuncaParaDeVerdad = true;
    const fin = c.g.terminar();
    await asentar();
    expect(c.g.estado().fase).toBe("cerrando");
    await c.reloj.avanzar(4000);
    expect((await fin).ok).toBe(true);
  });

  it("si el servidor no contesta pronto, empieza igual con un número local", async () => {
    const c = montar();
    c.servidor.guion.sesion = "colgada";
    const inicio = c.g.iniciar();
    await asentar();
    expect(c.g.estado().fase).toBe("iniciando");
    await c.reloj.avanzar(3000);
    await inicio;
    expect(c.g.estado()).toMatchObject({ fase: "grabando", session: 1 });
  });
});

describe("grabadora · recuperar tras un cierre brusco", () => {
  it("sube lo que quedó guardado y deja continuar en una sesión nueva que no pisa la anterior", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    // Nueve trozos guardados; la ficha de la sesión se quedó en el cuarto (el navegador se cerró entre ambas escrituras).
    const trozos = await sesionAbandonada(almacen, { idxGuardados: [0, 1, 2, 3, 4, 5, 6, 7, 8], ultimoIdxAnotado: 3 });

    const c = montar({ almacen });
    await c.g.inicializar();
    await asentar();
    expect(c.g.estado().recuperadas).toEqual({ sesiones: 1, durMs: 45_000, bytes: 4000 });
    expect(c.servidor.secuencias(1)).toEqual([0, 1]);
    expect(c.servidor.partes.get("1:1")!.bytes).toEqual(unir([trozos[6], trozos[7], trozos[8]]));
    expect(c.g.estado().fase).toBe("inactiva");

    await c.g.iniciar(); // «Continuar»
    expect(c.g.estado().session).toBe(2);
    await c.reloj.avanzar(3000);
    await c.g.marcar("tema");
    await asentar();
    expect(c.servidor.marcas.map((m) => m.atMs)).toEqual([48_000]); // 45 s de la sesión anterior + 3 s

    await grabar(c, 5);
    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.llamadas.cerrar[0].map((s) => [s.session, s.ultimaSecuencia])).toEqual([[1, 1], [2, 0]]);
  });

  it("sin conexión con el servidor, la sesión nueva sigue la numeración local", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    await sesionAbandonada(almacen, { session: 4, idxGuardados: [0, 1], ultimoIdxAnotado: 1, cerrada: true });
    const c = montar({ almacen });
    c.servidor.guion.sesion = "falla";
    await c.g.inicializar();
    await c.g.iniciar();
    expect(c.g.estado().session).toBe(5);
  });

  it("si el servidor propone un número ya usado aquí, se respeta lo que hay en el dispositivo", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    await sesionAbandonada(almacen, { session: 3, idxGuardados: [0, 1], ultimoIdxAnotado: 1, cerrada: true });
    const c = montar({ almacen });
    c.reloj.conexion(false); // lo guardado aún no ha llegado al servidor, que va atrasado
    await c.g.inicializar();
    await c.g.iniciar();
    expect(c.g.estado().session).toBe(4);
  });

  it("«Terminar y procesar lo grabado» funciona sin haber vuelto a grabar", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    await sesionAbandonada(almacen, { idxGuardados: [0, 1, 2, 3, 4, 5, 6], ultimoIdxAnotado: 6 });
    const c = montar({ almacen });
    await c.g.inicializar();
    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.llamadas.cerrar).toEqual([[{ session: 1, ultimaSecuencia: 1, mimeType: MIME, duracionMs: 35_000 }]]);
    expect(await c.almacen.listarSesiones(c.meetingId)).toEqual([]);
  });

  it("una sesión vacía (el navegador se cerró a los pocos segundos) se descarta sin ruido", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    await sesionAbandonada(almacen, { idxGuardados: [], ultimoIdxAnotado: -1 });
    const c = montar({ almacen });
    await c.g.inicializar();
    expect(c.g.estado().recuperadas).toBeNull();
    expect(await almacen.listarSesiones("reunion-1")).toEqual([]);
  });

  it("si se borraron datos del dispositivo, sube hasta donde hay audio seguido y lo avisa", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    // Se perdieron los trozos 6 y 7 (y la ficha dice que había hasta el 8).
    await sesionAbandonada(almacen, { idxGuardados: [0, 1, 2, 3, 4, 5, 8], ultimoIdxAnotado: 8, cerrada: true });
    const c = montar({ almacen });
    await c.g.inicializar();
    await asentar();
    expect(c.servidor.secuencias(1)).toEqual([0]);
    expect(c.g.estado().mensaje).toMatch(/Se perdió parte de la grabación guardada/);

    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.llamadas.cerrar[0]).toEqual([expect.objectContaining({ session: 1, ultimaSecuencia: 0 })]);
  });

  it("si se perdió todo lo guardado, no inventa una grabación", async () => {
    const almacen = new AlmacenGrabacionesEnMemoria();
    await sesionAbandonada(almacen, { idxGuardados: [], ultimoIdxAnotado: 8, cerrada: true });
    const c = montar({ almacen });
    await c.g.inicializar();
    await asentar();
    const r = await c.g.terminar();
    expect(r).toEqual({ ok: false, motivo: expect.stringMatching(/No se grabó nada/) });
  });
});

describe("grabadora · cierre en el servidor", () => {
  it("si el servidor dice que faltan partes, las vuelve a subir desde lo guardado y reintenta el cierre", async () => {
    const c = montar();
    c.servidor.guion.cierres.push({ ok: false, faltan: [{ session: 1, seq: 0 }] });
    await c.g.iniciar();
    await grabar(c, 7);
    c.mic().grabador.restante = new Uint8Array(100).fill(9);
    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.llamadas.cerrar).toHaveLength(2);
    expect(c.servidor.llamadas.subir).toEqual(["1:0", "1:1", "1:0"]);
  });

  it("se rinde tras tres vueltas con partes faltantes y deja todo en el dispositivo", async () => {
    const c = montar();
    c.servidor.guion.cierres.push(...Array.from({ length: 10 }, () => ({ ok: false as const, faltan: [{ session: 1, seq: 0 }] })));
    await c.g.iniciar();
    await grabar(c, 6);
    const r = await c.g.terminar();
    expect(r).toMatchObject({ ok: false, motivo: expect.stringMatching(/sigue sin recibir/) });
    expect(c.servidor.llamadas.cerrar).toHaveLength(4);
    expect(c.g.estado().fase).toBe("interrumpida");
    expect(await c.almacen.ultimoTrozo(c.meetingId, 1)).toBe(5); // no se borró nada
  });

  it("un fallo de red al cerrar no gasta vueltas: espera y repite", async () => {
    const c = montar();
    c.servidor.guion.cierres.push(new Error("Failed to fetch"), new Error("Failed to fetch"));
    await c.g.iniciar();
    await grabar(c, 6);
    const fin = c.g.terminar();
    await asentar();
    expect(c.servidor.llamadas.cerrar).toHaveLength(1);
    await c.reloj.avanzar(esperaDeReintentoVivo(1));
    expect(c.servidor.llamadas.cerrar).toHaveLength(2);
    await c.reloj.avanzar(esperaDeReintentoVivo(2));
    expect((await fin).ok).toBe(true);
    expect(c.servidor.llamadas.cerrar).toHaveLength(3);
  });

  it("si se cae la conexión al cerrar, espera a que vuelva en vez de insistir", async () => {
    const c = montar();
    c.servidor.guion.cierres.push(new Error("Failed to fetch"));
    await c.g.iniciar();
    await grabar(c, 6);
    const fin = c.g.terminar();
    await asentar();
    c.reloj.conexion(false);
    await c.reloj.avanzar(esperaDeReintentoVivo(1)); // el cierre ya falló; ahora no hay red
    expect(c.servidor.llamadas.cerrar.length).toBeLessThanOrEqual(2);
    const antes = c.servidor.llamadas.cerrar.length;
    await c.reloj.avanzar(60_000);
    expect(c.servidor.llamadas.cerrar).toHaveLength(antes); // sin red no intenta
    c.reloj.conexion(true);
    expect((await fin).ok).toBe(true);
  });

  it("un rechazo definitivo al cerrar se muestra y deja la grabación a salvo", async () => {
    const c = montar();
    c.servidor.guion.cierres.push(new ErrorGrabacion("Esta reunión ya no acepta grabaciones.", "fatal"));
    await c.g.iniciar();
    await grabar(c, 2);
    const r = await c.g.terminar();
    expect(r).toEqual({ ok: false, motivo: "Esta reunión ya no acepta grabaciones." });
    expect(c.g.estado().fase).toBe("interrumpida");
    expect(await c.almacen.ultimoTrozo(c.meetingId, 1)).toBe(1);
  });

  it("devuelve el estado que dice el servidor (otra grabación puede seguir abierta)", async () => {
    const c = montar();
    c.servidor.guion.cierres.push({ ok: true, status: "grabando" });
    await c.g.iniciar();
    await grabar(c, 2);
    expect(await c.g.terminar()).toEqual({ ok: true, status: "grabando" });
  });
});

describe("grabadora · salir sin esperar y descartar", () => {
  it("«salir sin esperar» deja lo grabado a salvo y la siguiente acción lo retoma", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 3);
    c.reloj.conexion(false);
    const fin = c.g.terminar();
    await asentar();
    expect(c.g.estado().fase).toBe("cerrando");

    c.g.abandonar();
    expect(await fin).toEqual({ ok: false, motivo: expect.any(String), abandonada: true });
    expect(c.g.estado().fase).toBe("interrumpida");
    expect(c.servidor.llamadas.subir).toEqual([]);
    expect(await c.almacen.ultimoTrozo(c.meetingId, 1)).toBe(2); // sigue en el dispositivo

    c.reloj.conexion(true);
    const r = await c.g.terminar();
    expect(r.ok).toBe(true);
    expect(c.servidor.secuencias(1)).toEqual([0]);
  });

  it("después de salir sin esperar, se puede volver a grabar", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 3);
    c.reloj.conexion(false);
    const fin = c.g.terminar();
    await asentar();
    c.g.abandonar();
    await fin;

    c.reloj.conexion(true);
    await c.g.iniciar();
    expect(c.g.estado().fase).toBe("grabando");
    await grabar(c, 6);
    expect(c.servidor.secuencias(2)).toEqual([0]);
    expect(c.servidor.secuencias(1)).toEqual([0]); // y lo de antes también llegó
  });

  it("descartar borra lo local y deja la grabadora lista para empezar de cero", async () => {
    const c = montar();
    await c.g.iniciar();
    await grabar(c, 8);
    await c.g.marcar("tema");
    await c.g.descartar();
    expect(c.g.estado()).toMatchObject({ fase: "inactiva", session: null, transcurridoMs: 0, partesPendientes: 0, recuperadas: null, marcas: 0 });
    expect(await c.almacen.listarSesiones(c.meetingId)).toEqual([]);
    expect(await c.almacen.listarMarcas(c.meetingId)).toEqual([]);
    expect(c.mic().cerrado).toBe(true);

    await c.g.iniciar();
    expect(c.g.estado().fase).toBe("grabando");
  });

  it("descartar mientras espera la red no se queda colgado", async () => {
    const c = montar();
    await c.g.iniciar();
    c.reloj.conexion(false);
    await grabar(c, 7);
    await c.g.descartar();
    expect(c.g.estado().fase).toBe("inactiva");
  });
});

describe("grabadora · estado y suscripciones", () => {
  it("avisa a quien escucha y deja de avisar al desuscribirse", async () => {
    const c = montar();
    const oyente = vi.fn();
    const baja = c.g.suscribir(oyente);
    await c.g.iniciar();
    expect(oyente).toHaveBeenCalled();
    const llamadas = oyente.mock.calls.length;
    baja();
    await c.reloj.avanzar(1000);
    expect(oyente).toHaveBeenCalledTimes(llamadas);
  });

  it("«ocupada» es verdadero mientras se graba o hay algo por subir, y falso al terminar", async () => {
    const c = montar();
    expect(c.g.ocupada()).toBe(false);
    await c.g.iniciar();
    expect(c.g.ocupada()).toBe(true);
    await grabar(c, 3);
    await c.g.terminar();
    expect(c.g.ocupada()).toBe(false);
  });
});
