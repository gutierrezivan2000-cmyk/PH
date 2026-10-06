import { describe, expect, it } from "vitest";
import {
  AlmacenEnMemoria, ErrorSubida, MAX_PARTES, MENSAJE_AGOTADO, MENSAJE_CADUCADA, MENSAJE_SIN_CONEXION, MIN_PARTE_BYTES,
  errorDeAborto, esAborto, esperaDeReintento, huella, iniciarSubida, planificarPartes, tamanoDeParte,
  type ApiSubida, type ArchivoSubible, type Entorno, type Progreso,
} from "./subida-reanudable";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/* ════════════════════════════════════════════════════════════════════
   Archivos de mentira: el contenido son bytes derivados de la posición, para no gastar memoria
   ════════════════════════════════════════════════════════════════════ */

function archivoFalso(nombre: string, tamano: number, ultimaModif = 1_700_000_000_000, semilla = 7): ArchivoSubible {
  return {
    name: nombre,
    size: tamano,
    lastModified: ultimaModif,
    slice(inicio = 0, fin = tamano) {
      const largo = Math.max(0, Math.min(fin, tamano) - inicio);
      // Solo se materializan cuerpos pequeños (la huella lee 1 MB); las partes grandes viajan como Blob vacío con `size`.
      if (largo <= 2 * MB) {
        const bytes = new Uint8Array(largo);
        for (let i = 0; i < largo; i++) bytes[i] = (inicio + i + semilla) % 251;
        return new Blob([bytes]);
      }
      return { size: largo, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Blob;
    },
  };
}

/* ════════════════════════════════════════════════════════════════════
   Entorno de mentira: reloj controlado y red que se puede cortar
   ════════════════════════════════════════════════════════════════════ */

function entornoFalso() {
  let t = 1_000_000;
  let enLinea = true;
  const esperandoRed: Array<() => void> = [];
  const dormidas: number[] = [];
  const entorno: Entorno = {
    ahora: () => t,
    dormir: async (ms, senal) => {
      if (senal.aborted) throw errorDeAborto();
      dormidas.push(ms);
      t += ms;
    },
    hayConexion: () => enLinea,
    esperarConexion: (senal) =>
      new Promise<void>((resolver, rechazar) => {
        if (enLinea) return resolver();
        senal.addEventListener("abort", () => rechazar(errorDeAborto()), { once: true });
        esperandoRed.push(resolver);
      }),
  };
  return {
    entorno,
    dormidas,
    avanzar: (ms: number) => { t += ms; },
    cortarRed: () => { enLinea = false; },
    volverRed: () => { enLinea = true; esperandoRed.splice(0).forEach((r) => r()); },
  };
}

/* ════════════════════════════════════════════════════════════════════
   «Vercel Blob» de mentira, con fallos configurables
   ════════════════════════════════════════════════════════════════════ */

type Guion = {
  /** Fallos pasajeros que devolverá cada parte antes de funcionar. */
  fallosPorParte?: Map<number, number>;
  /** Qué error devolver la próxima vez que se pida subir esa parte. */
  errorEnParte?: Map<number, unknown>;
  /** Partes que se quedan «en vuelo» hasta que se abra su puerta (para probar pausa y cancelación). */
  retener?: Set<number>;
  /** Errores de completar, en orden. */
  erroresCompletar?: unknown[];
  /** Errores de registrar, en orden. */
  erroresRegistrar?: unknown[];
  /** Cuántos permisos pedidos fallan con «token vencido» en subirParte. */
  vencerTokenEnPartes?: number;
};

function servidorFalso(guion: Guion = {}) {
  const llamadas = { token: [] as Array<string | undefined>, crear: 0, partes: [] as number[], completar: 0, registrar: 0 };
  const exitos = new Set<number>();
  const puertas = new Map<number, () => void>();
  let enVueloAhora = 0;
  let maxEnVuelo = 0;
  let tokenN = 0;
  let uploadN = 0;
  let vencimientos = guion.vencerTokenEnPartes ?? 0;
  const tokensValidos = new Set<string>();
  const completadas: Array<{ partes: number[] }> = [];

  const api: ApiSubida = {
    async pedirToken(d, senal) {
      if (senal.aborted) throw errorDeAborto();
      llamadas.token.push(d.pathname);
      const token = `tok-${++tokenN}`;
      tokensValidos.add(token);
      return { token, pathname: d.pathname ?? `meetings/m1/fuentes/aaaaaaaa-${d.nombre}`, contentType: d.tipo, partSize: 16 * MB };
    },
    async crearMultipart() {
      llamadas.crear++;
      return { key: "meetings/m1/fuentes/aaaaaaaa-x", uploadId: `up-${++uploadN}` };
    },
    async subirParte(d, senal) {
      llamadas.partes.push(d.numero);
      enVueloAhora++;
      maxEnVuelo = Math.max(maxEnVuelo, enVueloAhora);
      try {
        d.alProgreso(Math.floor(d.cuerpo.size / 2));
        if (guion.retener?.has(d.numero)) {
          await new Promise<void>((resolver, rechazar) => {
            puertas.set(d.numero, resolver);
            senal.addEventListener("abort", () => rechazar(errorDeAborto()), { once: true });
          });
        }
        if (senal.aborted) throw errorDeAborto();
        if (vencimientos > 0) {
          vencimientos--;
          tokensValidos.delete(d.token);
          throw new ErrorSubida("Client token has expired.", "token");
        }
        if (!tokensValidos.has(d.token)) throw new ErrorSubida("Client token has expired.", "token");
        const fallos = guion.fallosPorParte?.get(d.numero) ?? 0;
        if (fallos > 0) {
          guion.fallosPorParte!.set(d.numero, fallos - 1);
          throw new ErrorSubida("Failed to fetch", "transitorio");
        }
        const err = guion.errorEnParte?.get(d.numero);
        if (err) {
          guion.errorEnParte!.delete(d.numero);
          throw err;
        }
        d.alProgreso(d.cuerpo.size);
        exitos.add(d.numero);
        return { etag: `etag-${d.numero}`, partNumber: d.numero };
      } finally {
        enVueloAhora--;
      }
    },
    async completar(d) {
      llamadas.completar++;
      const e = guion.erroresCompletar?.shift();
      if (e) throw e;
      completadas.push({ partes: d.partes.map((p) => p.partNumber) });
      return { url: `https://x.private.blob.vercel-storage.com/${d.pathname}`, pathname: d.pathname };
    },
    async registrar() {
      llamadas.registrar++;
      const e = guion.erroresRegistrar?.shift();
      if (e) throw e;
    },
  };
  return {
    api,
    llamadas,
    exitos,
    completadas,
    abrirPuerta: (n: number) => { puertas.get(n)?.(); puertas.delete(n); },
    abrirTodas: () => { for (const n of [...puertas.keys()]) { puertas.get(n)?.(); puertas.delete(n); } },
    puertasAbiertas: () => [...puertas.keys()],
    get maxEnVuelo() { return maxEnVuelo; },
  };
}

const esperarHasta = async (condicion: () => boolean, vueltas = 200) => {
  for (let i = 0; i < vueltas && !condicion(); i++) await new Promise((r) => setTimeout(r, 0));
  if (!condicion()) throw new Error("La condición no se cumplió a tiempo");
};

function lanzar(opc: { archivo: ArchivoSubible; srv: ReturnType<typeof servidorFalso>; almacen?: AlmacenEnMemoria; env?: ReturnType<typeof entornoFalso>; reintentos?: number; concurrencia?: number; meetingId?: string }) {
  const progresos: Progreso[] = [];
  const env = opc.env ?? entornoFalso();
  const almacen = opc.almacen ?? new AlmacenEnMemoria();
  const control = iniciarSubida({
    meetingId: opc.meetingId ?? "m1", archivo: opc.archivo, tipo: "audio/mp4", api: opc.srv.api, almacen, entorno: env.entorno,
    reintentos: opc.reintentos, concurrencia: opc.concurrencia, alProgreso: (p) => progresos.push(p),
  });
  return { control, progresos, env, almacen, ultimo: () => progresos[progresos.length - 1] };
}

/* ════════════════════════════════════════════════════════════════════ */

describe("planificarPartes", () => {
  it("parte el archivo en trozos de 16 MB y la última es la que sobra", () => {
    const p = planificarPartes(40 * MB);
    expect(p.map((x) => [x.numero, x.bytes])).toEqual([[1, 16 * MB], [2, 16 * MB], [3, 8 * MB]]);
    expect(p[0]).toMatchObject({ inicio: 0, fin: 16 * MB });
    expect(p[2]).toMatchObject({ inicio: 32 * MB, fin: 40 * MB });
  });
  it("cubre el archivo exacto, sin huecos ni solapes, en cualquier tamaño", () => {
    for (const tamano of [1, 5 * MB - 1, 16 * MB, 16 * MB + 1, 100 * MB + 7, 5.5 * GB]) {
      const p = planificarPartes(Math.floor(tamano));
      expect(p[0].inicio).toBe(0);
      expect(p[p.length - 1].fin).toBe(Math.floor(tamano));
      for (let i = 1; i < p.length; i++) expect(p[i].inicio).toBe(p[i - 1].fin);
      expect(p.reduce((s, x) => s + x.bytes, 0)).toBe(Math.floor(tamano));
      expect(p.map((x) => x.numero)).toEqual(p.map((_, i) => i + 1));
    }
  });
  it("todas las partes menos la última cumplen el mínimo de 5 MB de Blob", () => {
    for (const tamano of [16 * MB + 1, 33 * MB, 3 * GB + 123]) {
      const p = planificarPartes(tamano);
      for (const x of p.slice(0, -1)) expect(x.bytes).toBeGreaterThanOrEqual(MIN_PARTE_BYTES);
    }
  });
  it("un archivo de 1 byte es una sola parte; uno exacto de 16 MB también", () => {
    expect(planificarPartes(1)).toEqual([{ numero: 1, inicio: 0, fin: 1, bytes: 1 }]);
    expect(planificarPartes(16 * MB)).toHaveLength(1);
  });
  it("el tope de la app (20 GB) son 1.280 partes", () => {
    expect(planificarPartes(20 * GB)).toHaveLength(1280);
  });
  it("si no cabría en 10.000 partes, las partes crecen (y de forma estable)", () => {
    const enorme = 200 * GB;
    expect(tamanoDeParte(enorme)).toBeGreaterThan(16 * MB);
    const p = planificarPartes(enorme);
    expect(p.length).toBeLessThanOrEqual(MAX_PARTES);
    expect(planificarPartes(enorme).length).toBe(p.length);
  });
  it("rechaza archivos vacíos, tamaños raros y partes menores al mínimo", () => {
    for (const t of [0, -1, 1.5, Number.NaN]) expect(() => planificarPartes(t), String(t)).toThrow(/vacío/);
    expect(() => planificarPartes(10 * MB, 4 * MB)).toThrow(/5 MB/);
  });
});

describe("huella", () => {
  it("es estable: el mismo archivo da la misma huella", async () => {
    expect(await huella(archivoFalso("a.m4a", 3 * MB))).toBe(await huella(archivoFalso("a.m4a", 3 * MB)));
  });
  it("cambia si cambia el nombre, el tamaño, la fecha o el contenido", async () => {
    const base = await huella(archivoFalso("a.m4a", 3 * MB));
    expect(await huella(archivoFalso("b.m4a", 3 * MB))).not.toBe(base);
    expect(await huella(archivoFalso("a.m4a", 3 * MB + 1))).not.toBe(base);
    expect(await huella(archivoFalso("a.m4a", 3 * MB, 1_700_000_000_001))).not.toBe(base);
    expect(await huella(archivoFalso("a.m4a", 3 * MB, undefined, 8))).not.toBe(base);
  });
  it("lee el primero y el ÚLTIMO megabyte: un cambio al final del archivo se nota", async () => {
    const a = archivoFalso("g.wav", 5 * MB);
    const b: ArchivoSubible = { ...a, slice: (i = 0, f = 5 * MB) => (i >= 4 * MB ? new Blob([new Uint8Array([9, 9, 9])]) : a.slice(i, f)) };
    expect(await huella(a)).not.toBe(await huella(b));
  });
  it("funciona con archivos de menos de 1 MB y de 1 byte", async () => {
    expect(await huella(archivoFalso("p.mp3", 10))).toMatch(/^[0-9a-f]{32}$/);
    expect(await huella(archivoFalso("p.mp3", 1))).toMatch(/^[0-9a-f]{32}$/);
  });
  it("sin crypto.subtle (página http) usa un respaldo y sigue siendo estable y sensible", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      const a = await huella(archivoFalso("a.m4a", 3 * MB));
      expect(a).toMatch(/^[0-9a-f]{16}$/);
      expect(await huella(archivoFalso("a.m4a", 3 * MB))).toBe(a);
      expect(await huella(archivoFalso("a.m4a", 3 * MB + 1))).not.toBe(a);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });
});

describe("esperaDeReintento y esAborto", () => {
  it("1, 2, 4, 8, 16 y luego 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(esperaDeReintento)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
  it("reconoce SUS abortos (el estándar y el del SDK de Blob), no cualquier error de red", () => {
    expect(esAborto(errorDeAborto())).toBe(true);
    expect(esAborto(new Error("The request was aborted."))).toBe(true);
    expect(esAborto(new Error("Vercel Blob: The request was aborted."))).toBe(true);
    expect(esAborto(new TypeError("Failed to fetch"))).toBe(false);
    expect(esAborto(new Error("Connection aborted by peer"))).toBe(false);
    expect(esAborto("AbortError")).toBe(false);
  });
});

describe("subida completa", () => {
  it("parte, sube, completa y registra una sola vez; deja el almacén limpio", async () => {
    const srv = servidorFalso();
    const { control, ultimo, almacen } = lanzar({ archivo: archivoFalso("consejo.m4a", 100 * MB), srv });
    const r = await control.terminada;
    expect(r).toMatchObject({ ok: true });
    expect([...srv.exitos].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(srv.llamadas).toMatchObject({ crear: 1, completar: 1, registrar: 1 });
    expect(srv.completadas[0].partes).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(ultimo()).toMatchObject({ estado: "lista", porcentaje: 100, partesHechas: 7, partesTotal: 7, reanudada: false, mensaje: null });
    expect(await almacen.listar("m1")).toEqual([]);
  });

  it("nunca tiene más de 3 partes a la vez (o las que se pidan)", async () => {
    const srv = servidorFalso({ retener: new Set([1, 2, 3, 4, 5, 6]) });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv });
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    expect(srv.puertasAbiertas().sort()).toEqual([1, 2, 3]);
    srv.abrirTodas();
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    srv.abrirTodas();
    await esperarHasta(() => srv.puertasAbiertas().length >= 0 && srv.exitos.size >= 6);
    srv.abrirTodas();
    await control.terminada;
    expect(srv.maxEnVuelo).toBe(3);
    const dos = servidorFalso();
    const b = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv: dos, concurrencia: 1 });
    await b.control.terminada;
    expect(dos.maxEnVuelo).toBe(1);
  });

  it("el avance es monótono y nunca llega a 100 % antes de registrar", async () => {
    const srv = servidorFalso();
    const { control, progresos } = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv });
    await control.terminada;
    let previo = 0;
    for (const p of progresos) {
      expect(p.subidos, JSON.stringify(p)).toBeGreaterThanOrEqual(previo);
      previo = p.subidos;
      if (p.estado !== "lista") expect(p.porcentaje).toBeLessThan(100);
    }
    expect(progresos[progresos.length - 1].porcentaje).toBe(100);
    expect(progresos.map((p) => p.estado)).toEqual(expect.arrayContaining(["preparando", "subiendo", "completando", "registrando", "lista"]));
  });

  it("mide velocidad y tiempo restante con el reloj", async () => {
    const srv = servidorFalso({ retener: new Set([1, 2, 3]) });
    const { control, env, progresos } = lanzar({ archivo: archivoFalso("a.m4a", 160 * MB), srv });
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    env.avanzar(2000);
    srv.abrirTodas(); // 3 partes de 16 MB = 48 MB en «2 s»
    await control.terminada;
    // Las demás partes terminan al instante: se mira la PRIMERA lectura con 3 partes hechas.
    const p = progresos.find((x) => x.partesHechas >= 3) as Progreso;
    expect(p.subidos).toBe(48 * MB);
    expect(p.bytesPorSegundo).toBe(24 * MB); // 48 MB en 2 s
    expect(p.restanteS).toBe(Math.ceil((160 * MB - 48 * MB) / (24 * MB)));
  });

  it("un archivo de 1 byte también se sube", async () => {
    const srv = servidorFalso();
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 1), srv });
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect([...srv.exitos]).toEqual([1]);
  });
});

describe("fallos pasajeros", () => {
  it("reintenta con espera creciente y termina", async () => {
    const srv = servidorFalso({ fallosPorParte: new Map([[2, 3]]) });
    const { control, env } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(env.dormidas).toEqual([1000, 2000, 4000]);
    expect(srv.llamadas.partes.filter((n) => n === 2)).toHaveLength(4);
    expect(srv.completadas[0].partes).toEqual([1, 2, 3, 4]);
  });

  it("si se agotan los intentos, falla CON el avance guardado, y al volver a elegir el archivo continúa", async () => {
    const srv = servidorFalso({ fallosPorParte: new Map([[3, 99]]) });
    const almacen = new AlmacenEnMemoria();
    const archivo = archivoFalso("a.m4a", 50 * MB);
    const a = lanzar({ archivo, srv, almacen, reintentos: 2 });
    const r = await a.control.terminada;
    expect(r).toEqual({ ok: false, error: MENSAJE_AGOTADO });
    expect(a.ultimo()).toMatchObject({ estado: "error", mensaje: MENSAJE_AGOTADO });
    const guardadas = await almacen.listar("m1");
    expect(guardadas).toHaveLength(1);
    const hechas = guardadas[0].partes.map((p) => p.partNumber).sort();
    expect(hechas).toEqual(expect.arrayContaining([1, 2]));
    expect(hechas).not.toContain(3);

    // Vuelve la red: se elige el mismo archivo y se suben SOLO las partes que faltaban.
    const srv2 = servidorFalso();
    const b = lanzar({ archivo, srv: srv2, almacen });
    { const r = await b.control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(b.progresos.some((p) => p.reanudada)).toBe(true);
    expect(srv2.llamadas.crear).toBe(0);
    // Se suben EXACTAMENTE las que no estaban guardadas (la 3 seguro; la 4 solo si no alcanzó a llegar antes del fallo).
    const faltaban = [1, 2, 3, 4].filter((n) => !hechas.includes(n));
    expect(faltaban).toContain(3);
    expect(srv2.llamadas.partes.sort()).toEqual(faltaban);
    expect(srv2.completadas[0].partes).toEqual([1, 2, 3, 4]);
  });

  it("un error que no tiene remedio (tipo no admitido, archivo demasiado grande) no se reintenta", async () => {
    const srv = servidorFalso({ errorEnParte: new Map([[1, new ErrorSubida("Content type mismatch", "fatal")]]) });
    const { control, env } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    expect(await control.terminada).toEqual({ ok: false, error: "Content type mismatch" });
    expect(env.dormidas).toEqual([]);
    expect(srv.llamadas.partes.filter((n) => n === 1)).toHaveLength(1);
  });

  it("si una parte se rinde, las demás dejan de empezar trabajo nuevo", async () => {
    const srv = servidorFalso({ errorEnParte: new Map([[1, new ErrorSubida("no", "fatal")]]) });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 160 * MB), srv });
    await control.terminada;
    expect(srv.llamadas.partes.length).toBeLessThan(10);
    expect(srv.llamadas.completar).toBe(0);
    expect(srv.llamadas.registrar).toBe(0);
  });
});

describe("permiso (token) vencido", () => {
  it("se renueva SIN contar como fallo y sin esperar, y la subida sigue", async () => {
    const srv = servidorFalso({ vencerTokenEnPartes: 2 });
    const { control, env } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(env.dormidas).toEqual([]);
    expect(srv.completadas[0].partes).toEqual([1, 2, 3, 4]);
    expect(srv.llamadas.crear).toBe(1);
    // El primer permiso es de la subida nueva (sin ruta); las renovaciones piden la MISMA ruta.
    expect(srv.llamadas.token[0]).toBeUndefined();
    expect(srv.llamadas.token.length).toBeGreaterThan(1);
    expect(new Set(srv.llamadas.token.slice(1))).toEqual(new Set(["meetings/m1/fuentes/aaaaaaaa-a.m4a"]));
  });

  it("varias partes que fallan a la vez comparten UNA renovación", async () => {
    const srv = servidorFalso({ vencerTokenEnPartes: 3 });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    await control.terminada;
    // 1 inicial + renovaciones: las partes que fallan a la vez comparten la petición (no una por parte).
    expect(srv.llamadas.token.length).toBeLessThanOrEqual(4);
  });

  it("si el permiso se sigue rechazando, se rinde con un mensaje claro (no se queda en bucle)", async () => {
    const srv = servidorFalso({ vencerTokenEnPartes: 999 });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    const r = await control.terminada;
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/renovar el permiso/);
  });
});

describe("subida caducada", () => {
  it("empieza de cero, avisa y termina", async () => {
    const srv = servidorFalso({ erroresCompletar: [new ErrorSubida("No such upload", "caducada")] });
    const { control, progresos } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(srv.llamadas.crear).toBe(2);
    expect(progresos.some((p) => p.mensaje === MENSAJE_CADUCADA)).toBe(true);
    expect(progresos[progresos.length - 1].mensaje).toBeNull();
  });

  it("un archivo que el servidor dice incompleto al registrar también se vuelve a subir", async () => {
    const srv = servidorFalso({ erroresRegistrar: [new ErrorSubida("El archivo no llegó completo", "caducada")] });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(srv.llamadas.crear).toBe(2);
    expect(srv.llamadas.registrar).toBe(2);
  });

  it("no se queda en un bucle de reinicios", async () => {
    const srv = servidorFalso({ erroresCompletar: [1, 2, 3, 4, 5].map(() => new ErrorSubida("No such upload", "caducada")) });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    const r = await control.terminada;
    expect(r.ok).toBe(false);
    expect(srv.llamadas.crear).toBe(3); // la inicial + 2 reinicios
  });
});

describe("reanudar tras cerrar la pestaña", () => {
  it("al volver a elegir el mismo archivo continúa con las partes que faltan, con la misma ruta", async () => {
    const archivo = archivoFalso("a.m4a", 100 * MB);
    const almacen = new AlmacenEnMemoria();

    // Primera visita: se cancela con 3 partes hechas… pero la cancelación borra, así que simulamos «cierre de pestaña»
    // copiando el estado guardado en pleno vuelo.
    const srv1 = servidorFalso({ retener: new Set([4, 5, 6, 7]) });
    const a = lanzar({ archivo, srv: srv1, almacen });
    await esperarHasta(() => srv1.exitos.size === 3 && srv1.puertasAbiertas().length === 3);
    const instantanea = await almacen.listar("m1");
    expect(instantanea).toHaveLength(1);
    expect(instantanea[0].partes.map((p) => p.partNumber).sort()).toEqual([1, 2, 3]);
    a.control.cancelar();
    await a.control.terminada;

    // Segunda visita (otro almacén que recuerda lo de la instantánea; ruta y uploadId iguales).
    const almacen2 = new AlmacenEnMemoria();
    await almacen2.guardar(instantanea[0]);
    const srv2 = servidorFalso();
    const b = lanzar({ archivo, srv: srv2, almacen: almacen2 });
    { const r = await b.control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(srv2.llamadas.crear).toBe(0);
    expect(srv2.llamadas.token).toEqual([instantanea[0].pathname]); // un permiso fresco para la MISMA ruta
    expect(srv2.llamadas.partes.sort()).toEqual([4, 5, 6, 7]);
    expect(srv2.completadas[0].partes).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(b.progresos.find((p) => p.estado === "subiendo")?.reanudada).toBe(true);
    expect(b.progresos.find((p) => p.estado === "subiendo")?.subidos).toBe(48 * MB);
    expect(await almacen2.listar("m1")).toEqual([]);
  });

  it("un archivo distinto (otra fecha de modificación, otro tamaño) NO hereda el estado de otro", async () => {
    const almacen = new AlmacenEnMemoria();
    const srvA = servidorFalso({ fallosPorParte: new Map([[2, 99]]) });
    await lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv: srvA, almacen, reintentos: 0 }).control.terminada;
    expect(await almacen.listar("m1")).toHaveLength(1);

    const srvB = servidorFalso();
    const b = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB, 1_800_000_000_000), srv: srvB, almacen });
    { const r = await b.control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(srvB.llamadas.crear).toBe(1);
    expect(b.progresos.some((p) => p.reanudada)).toBe(false);
  });

  it("dos reuniones con el mismo archivo no comparten estado", async () => {
    const almacen = new AlmacenEnMemoria();
    const archivo = archivoFalso("a.m4a", 50 * MB);
    await lanzar({ archivo, srv: servidorFalso({ fallosPorParte: new Map([[2, 99]]) }), almacen, reintentos: 0, meetingId: "m1" }).control.terminada;
    const srv = servidorFalso();
    const b = lanzar({ archivo, srv, almacen, meetingId: "m2" });
    await b.control.terminada;
    expect(srv.llamadas.crear).toBe(1);
    expect((await almacen.listar("m1")).length).toBe(1);
  });

  it("si ya se completó en Blob y solo faltaba registrar, no vuelve a subir nada", async () => {
    const archivo = archivoFalso("a.m4a", 50 * MB);
    const almacen = new AlmacenEnMemoria();
    // Primera visita: todo sube pero el registro falla del todo.
    const srv1 = servidorFalso({ erroresRegistrar: Array.from({ length: 20 }, () => new ErrorSubida("Failed to fetch", "transitorio")) });
    const a = lanzar({ archivo, srv: srv1, almacen, reintentos: 1 });
    const r1 = await a.control.terminada;
    expect(r1.ok).toBe(false);
    const [g] = await almacen.listar("m1");
    expect(g.completado).not.toBeNull();

    const srv2 = servidorFalso();
    const b = lanzar({ archivo, srv: srv2, almacen });
    { const r = await b.control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(srv2.llamadas.partes).toEqual([]);
    expect(srv2.llamadas.crear).toBe(0);
    expect(srv2.llamadas.token).toEqual([]);
    expect(srv2.llamadas.registrar).toBe(1);
  });

  it("si el almacén local falla (modo privado, disco lleno) la subida igual funciona, solo que sin poder reanudarse", async () => {
    const roto = {
      leer: async () => { throw new Error("IDB cerrada"); },
      guardar: async () => { throw new Error("cuota excedida"); },
      borrar: async () => { throw new Error("IDB cerrada"); },
      listar: async () => [],
    };
    const srv = servidorFalso();
    const env = entornoFalso();
    const c = iniciarSubida({ meetingId: "m1", archivo: archivoFalso("a.m4a", 50 * MB), tipo: "audio/mp4", api: srv.api, almacen: roto, entorno: env.entorno, alProgreso: () => {} });
    expect(await c.terminada).toMatchObject({ ok: true });
  });
});

describe("pausa y reanudación", () => {
  it("pausar corta lo que va en vuelo, no empieza nada nuevo, y al reanudar (con 3 trabajadores) todos continúan", async () => {
    const srv = servidorFalso({ retener: new Set([1, 2, 3]) });
    const { control, ultimo } = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv });
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    control.pausar();
    await esperarHasta(() => ultimo().estado === "pausada");
    await new Promise((r) => setTimeout(r, 5));
    expect(srv.exitos.size).toBe(0);
    expect(srv.llamadas.partes).toEqual([1, 2, 3]); // nada nuevo mientras está en pausa
    expect(ultimo().restanteS).toBeNull();
    expect(ultimo().bytesPorSegundo).toBe(0);

    control.reanudar();
    // Las partes 1-3 se vuelven a pedir (la pausa las cortó) y se retienen de nuevo en su puerta.
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    for (let i = 0; i < 40 && ultimo().estado !== "lista"; i++) { srv.abrirTodas(); await new Promise((r) => setTimeout(r, 0)); }
    const r = await control.terminada;
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect([...srv.exitos].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(srv.completadas[0].partes).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("pausar y reanudar al instante (antes de que llegue el error de aborto) no se toma por un fallo", async () => {
    const srv = servidorFalso({ retener: new Set([1, 2, 3]) });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv, reintentos: 0 });
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    control.pausar();
    control.reanudar(); // síncrono: el aborto de las 3 partes todavía no llegó
    for (let i = 0; i < 60; i++) { srv.abrirTodas(); await new Promise((r) => setTimeout(r, 0)); }
    const r = await control.terminada;
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
  });

  it("la pausa NO gasta intentos: se puede pausar muchas veces con reintentos=0", async () => {
    const srv = servidorFalso({ retener: new Set([1]) });
    const { control, ultimo } = lanzar({ archivo: archivoFalso("a.m4a", 20 * MB), srv, reintentos: 0, concurrencia: 1 });
    for (let i = 0; i < 4; i++) {
      await esperarHasta(() => srv.puertasAbiertas().includes(1));
      control.pausar();
      await esperarHasta(() => ultimo().estado === "pausada");
      control.reanudar();
    }
    srv.abrirTodas();
    for (let i = 0; i < 30 && ultimo().estado !== "lista"; i++) { srv.abrirTodas(); await new Promise((r) => setTimeout(r, 0)); }
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
  });

  it("pausar o reanudar dos veces seguidas no rompe nada", async () => {
    const srv = servidorFalso();
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    control.reanudar();
    control.pausar();
    control.pausar();
    control.reanudar();
    control.reanudar();
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
  });
});

describe("cancelación", () => {
  it("corta todo, devuelve «cancelada», borra el estado guardado y no registra nada", async () => {
    const srv = servidorFalso({ retener: new Set([1, 2, 3]) });
    const { control, ultimo, almacen } = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv });
    await esperarHasta(() => srv.puertasAbiertas().length === 3);
    control.cancelar();
    expect(await control.terminada).toEqual({ ok: false, cancelada: true, error: "Subida cancelada." });
    expect(ultimo().estado).toBe("cancelada");
    expect(srv.llamadas.completar).toBe(0);
    expect(srv.llamadas.registrar).toBe(0);
    expect(await almacen.listar("m1")).toEqual([]);
  });

  it("cancelar en pausa también termina", async () => {
    const srv = servidorFalso({ retener: new Set([1]) });
    const { control, ultimo } = lanzar({ archivo: archivoFalso("a.m4a", 20 * MB), srv, concurrencia: 1 });
    await esperarHasta(() => srv.puertasAbiertas().includes(1));
    control.pausar();
    await esperarHasta(() => ultimo().estado === "pausada");
    control.cancelar();
    expect((await control.terminada).ok).toBe(false);
  });

  it("cancelar antes de que empiece el trabajo (mientras calcula la huella) no deja rastro", async () => {
    const srv = servidorFalso();
    const { control, almacen } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    control.cancelar();
    const r = await control.terminada;
    expect(r).toMatchObject({ ok: false, cancelada: true });
    expect(srv.llamadas.crear).toBe(0);
    expect(await almacen.listar("m1")).toEqual([]);
  });

  it("cancelar dos veces es inocuo", async () => {
    const srv = servidorFalso();
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    control.cancelar();
    control.cancelar();
    expect((await control.terminada).ok).toBe(false);
  });
});

describe("sin conexión", () => {
  it("no gasta intentos: avisa, espera a que vuelva internet y sigue", async () => {
    const srv = servidorFalso();
    const env = entornoFalso();
    env.cortarRed();
    const { control, progresos } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv, env, reintentos: 0 });
    await esperarHasta(() => progresos.some((p) => p.mensaje === MENSAJE_SIN_CONEXION));
    expect(srv.llamadas.partes).toEqual([]);
    expect(srv.llamadas.crear).toBe(0);
    env.volverRed();
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(progresos[progresos.length - 1].mensaje).toBeNull();
    expect(env.dormidas).toEqual([]);
  });

  it("si se corta a media subida, no empieza partes nuevas y al volver sigue donde iba", async () => {
    const srv = servidorFalso({ retener: new Set([3, 4, 5, 6, 7]) });
    const env = entornoFalso();
    const { control, progresos } = lanzar({ archivo: archivoFalso("a.m4a", 100 * MB), srv, env, concurrencia: 1 });
    await esperarHasta(() => srv.puertasAbiertas().includes(3)); // las partes 1 y 2 ya llegaron; la 3 va en vuelo
    expect([...srv.exitos].sort()).toEqual([1, 2]);
    env.cortarRed();
    srv.abrirPuerta(3); // la parte en vuelo termina (ya estaba enviada)…
    await esperarHasta(() => progresos.some((p) => p.mensaje === MENSAJE_SIN_CONEXION)); // …y la siguiente espera a la red
    expect(srv.llamadas.partes).toEqual([1, 2, 3]);
    await new Promise((r) => setTimeout(r, 5));
    expect(srv.llamadas.partes).toEqual([1, 2, 3]); // sin red no se intenta nada ni se gastan intentos
    expect(env.dormidas).toEqual([]);
    env.volverRed();
    for (let i = 0; i < 40; i++) { srv.abrirTodas(); await new Promise((r) => setTimeout(r, 0)); }
    const r = await control.terminada;
    expect(r, JSON.stringify(r)).toMatchObject({ ok: true });
    expect(srv.completadas[0].partes).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(srv.llamadas.partes.filter((n) => n === 3)).toHaveLength(1);
  });

  it("cancelar mientras espera la red termina sin colgarse", async () => {
    const env = entornoFalso();
    env.cortarRed();
    const { control, progresos } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv: servidorFalso(), env });
    await esperarHasta(() => progresos.some((p) => p.mensaje === MENSAJE_SIN_CONEXION));
    control.cancelar();
    expect(await control.terminada).toMatchObject({ ok: false, cancelada: true });
  });
});

describe("registro en el servidor", () => {
  it("reintenta el registro si falla de forma pasajera (el servidor es idempotente)", async () => {
    const srv = servidorFalso({ erroresRegistrar: [new ErrorSubida("Failed to fetch", "transitorio"), new ErrorSubida("500", "transitorio")] });
    const { control, env } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    { const r = await control.terminada; expect(r, JSON.stringify(r)).toMatchObject({ ok: true }); }
    expect(srv.llamadas.registrar).toBe(3);
    expect(env.dormidas).toEqual([1000, 2000]);
    expect(srv.llamadas.completar).toBe(1);
  });

  it("un rechazo definitivo del servidor (la reunión ya no admite archivos) se muestra tal cual", async () => {
    const srv = servidorFalso({ erroresRegistrar: [new ErrorSubida("Esta reunión ya no admite más archivos.", "fatal")] });
    const { control } = lanzar({ archivo: archivoFalso("a.m4a", 50 * MB), srv });
    expect(await control.terminada).toEqual({ ok: false, error: "Esta reunión ya no admite más archivos." });
  });
});
