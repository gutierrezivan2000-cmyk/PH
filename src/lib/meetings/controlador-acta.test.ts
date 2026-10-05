/** El controlador del acta en la pantalla, con un cliente y un reloj falsos: carga, seguimiento, texto, pedir y retomar. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearControladorDeActa, type ClienteDeActa } from "./controlador-acta";
import type { ActaDTO, RespuestaActa } from "./dto";

const acta = (extra: Partial<ActaDTO> = {}): ActaDTO => ({
  id: "g1", estado: "procesando", progreso: 10, etapa: "redactando", secciones: { hechas: 1, total: 5 }, creadaEn: "2026-10-05T15:00:00.000Z", terminadaEn: null,
  error: null, pendientes: [], requisitos: null, archivos: null, ...extra,
});
const lista = (extra: Partial<ActaDTO> = {}) => acta({ estado: "lista", progreso: 100, etapa: null, secciones: null, archivos: { html: "/api/download/g1/acta", markdown: "/api/download/g1/acta-markdown" }, ...extra });
const error = (extra: Partial<ActaDTO> = {}) => acta({ estado: "error", progreso: 0, etapa: null, secciones: null, error: "No pudimos redactar la sección «X» del acta.", ...extra });
const respuesta = (a: ActaDTO | null, texto: string | null = null): RespuestaActa => ({ acta: a, texto });

/** Un reloj que se mueve cuando la prueba lo pide. */
function reloj() {
  const pendientes = new Map<number, () => void>();
  let n = 0;
  return {
    programar: (fn: () => void) => {
      pendientes.set(++n, fn);
      return n;
    },
    cancelar: (id: unknown) => void pendientes.delete(id as number),
    hay: () => pendientes.size,
    /** Dispara lo programado (y espera a que termine lo que eso inicie). */
    async avanzar() {
      const fns = [...pendientes.values()];
      pendientes.clear();
      for (const f of fns) f();
      await tic();
    },
  };
}
const tic = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

let cliente: { obtener: ReturnType<typeof vi.fn>; pedir: ReturnType<typeof vi.fn>; reanudar: ReturnType<typeof vi.fn> };
let r: ReturnType<typeof reloj>;
beforeEach(() => {
  cliente = { obtener: vi.fn(), pedir: vi.fn(), reanudar: vi.fn() };
  r = reloj();
});
const crear = () => crearControladorDeActa({ cliente: cliente as unknown as ClienteDeActa, programar: r.programar, cancelar: r.cancelar });

describe("la primera carga", () => {
  it("empieza «cargando» y, al llegar, deja el acta (y su texto si está lista)", async () => {
    cliente.obtener.mockResolvedValue(respuesta(lista(), "## ACTA"));
    const c = crear();
    expect(c.leer()).toMatchObject({ cargando: true, acta: null, texto: null });
    c.iniciar();
    await tic();
    expect(c.leer()).toMatchObject({ cargando: false, errorDeCarga: null, acta: { estado: "lista" }, texto: "## ACTA" });
    expect(cliente.obtener).toHaveBeenCalledTimes(1);
    expect(cliente.obtener).toHaveBeenCalledWith({ texto: true });
    expect(r.hay()).toBe(0); // lista: no hay nada que seguir
  });

  it("sin acta pedida todavía: acta null y sin seguimiento", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    const c = crear();
    c.iniciar();
    await tic();
    expect(c.leer()).toMatchObject({ cargando: false, acta: null, texto: null });
    expect(r.hay()).toBe(0);
  });

  it("si falla, lo dice (con el mensaje) y «Reintentar» vuelve a cargar", async () => {
    cliente.obtener.mockRejectedValueOnce(new Error("Tuvimos un problema de nuestro lado."));
    const c = crear();
    c.iniciar();
    await tic();
    expect(c.leer()).toMatchObject({ cargando: false, errorDeCarga: "Tuvimos un problema de nuestro lado." });
    cliente.obtener.mockResolvedValue(respuesta(lista(), "T"));
    c.recargar();
    expect(c.leer()).toMatchObject({ cargando: true, errorDeCarga: null });
    await tic();
    expect(c.leer()).toMatchObject({ cargando: false, errorDeCarga: null, texto: "T" });
  });

  it("iniciar dos veces no carga dos veces", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    const c = crear();
    c.iniciar();
    c.iniciar();
    await tic();
    expect(cliente.obtener).toHaveBeenCalledTimes(1);
  });
});

describe("el seguimiento mientras se redacta", () => {
  it("consulta cada intervalo (sin pedir el texto) hasta que termina; entonces trae el texto UNA vez y deja de consultar", async () => {
    cliente.obtener.mockResolvedValueOnce(respuesta(acta({ progreso: 10 })));
    const c = crear();
    c.iniciar();
    await tic();
    expect(c.leer().acta).toMatchObject({ estado: "procesando", progreso: 10 });
    expect(r.hay()).toBe(1);

    cliente.obtener.mockResolvedValueOnce(respuesta(acta({ progreso: 55 })));
    await r.avanzar();
    expect(c.leer().acta?.progreso).toBe(55);
    expect(cliente.obtener).toHaveBeenLastCalledWith({ texto: false });
    expect(r.hay()).toBe(1);

    cliente.obtener.mockResolvedValueOnce(respuesta(lista())); // terminó, pero sin texto (no se pidió)
    cliente.obtener.mockResolvedValueOnce(respuesta(lista(), "## ACTA con texto"));
    await r.avanzar();
    expect(c.leer()).toMatchObject({ acta: { estado: "lista" }, texto: "## ACTA con texto" });
    expect(cliente.obtener).toHaveBeenLastCalledWith({ texto: true });
    expect(cliente.obtener).toHaveBeenCalledTimes(4);
    expect(r.hay()).toBe(0);
  });

  it("si termina con error, deja de consultar y muestra el mensaje", async () => {
    cliente.obtener.mockResolvedValueOnce(respuesta(acta()));
    const c = crear();
    c.iniciar();
    await tic();
    cliente.obtener.mockResolvedValueOnce(respuesta(error()));
    await r.avanzar();
    expect(c.leer()).toMatchObject({ acta: { estado: "error", error: "No pudimos redactar la sección «X» del acta." }, texto: null });
    expect(r.hay()).toBe(0);
  });

  it("un tropiezo de la red en una consulta no detiene el seguimiento", async () => {
    cliente.obtener.mockResolvedValueOnce(respuesta(acta()));
    const c = crear();
    c.iniciar();
    await tic();
    cliente.obtener.mockRejectedValueOnce(new Error("sin conexión"));
    await r.avanzar();
    expect(c.leer().acta?.estado).toBe("procesando");
    expect(c.leer().errorDeCarga).toBeNull();
    expect(r.hay()).toBe(1); // sigue
    cliente.obtener.mockResolvedValueOnce(respuesta(lista(), "T"));
    await r.avanzar();
    expect(c.leer().acta?.estado).toBe("lista");
  });

  it("si el texto no se pudo traer al terminar, el acta queda lista sin texto y no se queda consultando", async () => {
    cliente.obtener.mockResolvedValueOnce(respuesta(acta()));
    const c = crear();
    c.iniciar();
    await tic();
    cliente.obtener.mockResolvedValueOnce(respuesta(lista())); // sin texto
    cliente.obtener.mockRejectedValueOnce(new Error("no se pudo leer"));
    await r.avanzar();
    expect(c.leer()).toMatchObject({ acta: { estado: "lista" }, texto: null });
    expect(r.hay()).toBe(0);
  });

  it("al detener, no consulta más ni avisa a nadie", async () => {
    cliente.obtener.mockResolvedValue(respuesta(acta()));
    const c = crear();
    const aviso = vi.fn();
    c.suscribir(aviso);
    c.iniciar();
    await tic();
    aviso.mockClear();
    c.detener();
    expect(r.hay()).toBe(0);
    await r.avanzar();
    expect(cliente.obtener).toHaveBeenCalledTimes(1);
    expect(aviso).not.toHaveBeenCalled();
  });

  it("una consulta que estaba en vuelo al detener no cambia nada cuando llega", async () => {
    let resolver!: (v: RespuestaActa) => void;
    cliente.obtener.mockReturnValue(new Promise<RespuestaActa>((res) => (resolver = res)));
    const c = crear();
    c.iniciar();
    c.detener();
    resolver(respuesta(lista(), "T"));
    await tic();
    expect(c.leer()).toMatchObject({ cargando: true, acta: null });
  });
});

describe("pedir el acta", () => {
  it("la pide, queda «enviando» mientras tanto, y luego se sigue su avance", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    let resolver!: (v: { acta: ActaDTO; yaEnCurso: boolean }) => void;
    cliente.pedir.mockReturnValue(new Promise((res) => (resolver = res)));
    const c = crear();
    c.iniciar();
    await tic();
    const p = c.pedir();
    expect(c.leer().enviando).toBe(true);
    resolver({ acta: acta({ progreso: 0, etapa: "preparando", secciones: null }), yaEnCurso: false });
    expect(await p).toEqual({ ok: true, yaEnCurso: false });
    expect(c.leer()).toMatchObject({ enviando: false, errorDeAccion: null, acta: { estado: "procesando", progreso: 0 } });
    expect(r.hay()).toBe(1);
  });

  it("si ya había una en curso lo dice", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    cliente.pedir.mockResolvedValue({ acta: acta(), yaEnCurso: true });
    const c = crear();
    c.iniciar();
    await tic();
    expect(await c.pedir()).toEqual({ ok: true, yaEnCurso: true });
  });

  it("si falla (por ejemplo, sin cupo), lo dice con el mensaje del servidor y no cambia el acta", async () => {
    cliente.obtener.mockResolvedValue(respuesta(lista(), "T"));
    cliente.pedir.mockRejectedValue(new Error("Has alcanzado el límite diario de 3 generaciones."));
    const c = crear();
    c.iniciar();
    await tic();
    expect(await c.pedir()).toEqual({ ok: false, mensaje: "Has alcanzado el límite diario de 3 generaciones." });
    expect(c.leer()).toMatchObject({ enviando: false, errorDeAccion: "Has alcanzado el límite diario de 3 generaciones.", acta: { estado: "lista" }, texto: "T" });
    // Al volver a intentar, el error se limpia.
    cliente.pedir.mockResolvedValue({ acta: acta({ id: "g2" }), yaEnCurso: false });
    await c.pedir();
    expect(c.leer().errorDeAccion).toBeNull();
  });

  it("un error sin mensaje usa uno claro", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    cliente.pedir.mockRejectedValue("algo raro");
    const c = crear();
    c.iniciar();
    await tic();
    expect(await c.pedir()).toEqual({ ok: false, mensaje: "No pudimos empezar el acta. Inténtalo de nuevo." });
  });

  it("pedir otra acta con una lista a la vista olvida el texto de la anterior", async () => {
    cliente.obtener.mockResolvedValue(respuesta(lista(), "TEXTO VIEJO"));
    const c = crear();
    c.iniciar();
    await tic();
    cliente.pedir.mockResolvedValue({ acta: acta({ id: "g2" }), yaEnCurso: false });
    await c.pedir();
    expect(c.leer()).toMatchObject({ acta: { id: "g2", estado: "procesando" }, texto: null });
  });

  it("dos clics seguidos no envían dos peticiones", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    cliente.pedir.mockReturnValue(new Promise(() => {}));
    const c = crear();
    c.iniciar();
    await tic();
    void c.pedir();
    expect(await c.pedir()).toEqual({ ok: false, mensaje: "Ya lo estamos haciendo." });
    expect(cliente.pedir).toHaveBeenCalledTimes(1);
  });

  it("una consulta de seguimiento que estaba en vuelo cuando se pidió otra acta no pisa a la nueva", async () => {
    cliente.obtener.mockResolvedValueOnce(respuesta(error()));
    const c = crear();
    c.iniciar();
    await tic();
    // Hay una consulta lenta en vuelo (de la acta con error)...
    let resolverVieja!: (v: RespuestaActa) => void;
    cliente.obtener.mockReturnValueOnce(new Promise<RespuestaActa>((res) => (resolverVieja = res)));
    c.recargar();
    // ...y se pide otra acta.
    cliente.pedir.mockResolvedValue({ acta: acta({ id: "nueva" }), yaEnCurso: false });
    await c.pedir();
    resolverVieja(respuesta(error()));
    await tic();
    expect(c.leer().acta).toMatchObject({ id: "nueva", estado: "procesando" });
  });
});

describe("«Intentar de nuevo» (retomar)", () => {
  it("retoma el acta que está en error y la sigue", async () => {
    cliente.obtener.mockResolvedValue(respuesta(error()));
    cliente.reanudar.mockResolvedValue({ acta: acta({ progreso: 12 }), yaEnCurso: false });
    const c = crear();
    c.iniciar();
    await tic();
    expect(await c.reanudar()).toEqual({ ok: true, yaEnCurso: false });
    expect(cliente.reanudar).toHaveBeenCalledWith("g1");
    expect(c.leer().acta).toMatchObject({ estado: "procesando", progreso: 12 });
    expect(r.hay()).toBe(1);
  });

  it("solo se retoma lo que está en error", async () => {
    cliente.obtener.mockResolvedValue(respuesta(lista(), "T"));
    const c = crear();
    c.iniciar();
    await tic();
    expect(await c.reanudar()).toEqual({ ok: false, mensaje: "Esta acta no está en error." });
    expect(cliente.reanudar).not.toHaveBeenCalled();
  });

  it("si no se pudo retomar, el acta sigue con su error y se dice por qué", async () => {
    cliente.obtener.mockResolvedValue(respuesta(error()));
    cliente.reanudar.mockRejectedValue(new Error("Has alcanzado el límite mensual de 15 generaciones."));
    const c = crear();
    c.iniciar();
    await tic();
    expect(await c.reanudar()).toEqual({ ok: false, mensaje: "Has alcanzado el límite mensual de 15 generaciones." });
    expect(c.leer()).toMatchObject({ acta: { estado: "error" }, errorDeAccion: "Has alcanzado el límite mensual de 15 generaciones." });
  });
});

describe("suscripción", () => {
  it("avisa a quien escucha en cada cambio, y deja de avisar al darse de baja; el estado es un objeto nuevo por cambio", async () => {
    cliente.obtener.mockResolvedValue(respuesta(null));
    const c = crear();
    const aviso = vi.fn();
    const baja = c.suscribir(aviso);
    const antes = c.leer();
    c.iniciar();
    await tic();
    expect(aviso).toHaveBeenCalled();
    expect(c.leer()).not.toBe(antes);
    expect(c.leer()).toBe(c.leer()); // estable entre cambios (lo exige useSyncExternalStore)
    baja();
    aviso.mockClear();
    cliente.pedir.mockResolvedValue({ acta: acta(), yaEnCurso: false });
    await c.pedir();
    expect(aviso).not.toHaveBeenCalled();
  });
});
