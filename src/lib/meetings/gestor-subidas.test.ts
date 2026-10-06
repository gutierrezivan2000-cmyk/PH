import { describe, expect, it, vi } from "vitest";
import { crearGestor, type ArchivoElegido, type DependenciasGestor, type Gestor, type ItemSubida } from "./gestor-subidas";
import { MAX_FUENTE_BYTES, MAX_FUENTES_POR_REUNION } from "./tipos";
import {
  AlmacenEnMemoria, MENSAJE_SIN_CONEXION, type ApiSubida, type ControlSubida, type EstadoGuardado, type OpcionesSubida, type Progreso, type ResultadoSubida,
} from "./subida-reanudable";

const MB = 1024 * 1024;

const archivo = (nombre: string, tamano = 40 * MB, ultimaModif = 1_700_000_000_000): ArchivoElegido => ({
  name: nombre, size: tamano, lastModified: ultimaModif, slice: () => new Blob([]),
});

const progreso = (extra: Partial<Progreso> = {}): Progreso => ({
  estado: "subiendo", subidos: 0, total: 40 * MB, porcentaje: 0, bytesPorSegundo: 0, restanteS: null, partesHechas: 0, partesTotal: 3,
  reanudada: false, mensaje: null, ...extra,
});

/** Un «motor» de mentira: cada subida queda abierta hasta que la prueba decide cómo termina. */
function motores() {
  const lanzados: Array<{
    opciones: OpcionesSubida;
    emitir: (p: Partial<Progreso>) => void;
    terminar: (r: ResultadoSubida) => void;
    control: ControlSubida & { pausas: number; reanudas: number; cancelaciones: number };
  }> = [];
  const iniciar = (opciones: OpcionesSubida): ControlSubida => {
    let resolver!: (r: ResultadoSubida) => void;
    const terminada = new Promise<ResultadoSubida>((r) => (resolver = r));
    const control = { pausas: 0, reanudas: 0, cancelaciones: 0 } as ControlSubida & { pausas: number; reanudas: number; cancelaciones: number };
    control.pausar = () => { control.pausas++; opciones.alProgreso(progreso({ estado: "pausada" })); };
    control.reanudar = () => { control.reanudas++; opciones.alProgreso(progreso({ estado: "subiendo" })); };
    control.cancelar = () => { control.cancelaciones++; resolver({ ok: false, cancelada: true, error: "Subida cancelada." }); };
    control.terminada = terminada;
    lanzados.push({
      opciones, control,
      emitir: (p) => opciones.alProgreso(progreso(p)),
      terminar: (r) => resolver(r),
    });
    return control;
  };
  return { iniciar, lanzados };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function montar(extra: Partial<DependenciasGestor> = {}, registradas: Array<{ name: string; sizeBytes: number }> = []) {
  const m = motores();
  const almacen = new AlmacenEnMemoria();
  const procesar = vi.fn(async () => {});
  const alRegistrar = vi.fn();
  const alProcesar = vi.fn();
  let n = 0;
  const gestor: Gestor = crearGestor({
    meetingId: "m1", almacen, api: {} as ApiSubida, procesar, fuentesRegistradas: () => registradas,
    iniciar: m.iniciar,
    // La huella de mentira depende del nombre y del tamaño (como la real, de forma simplificada).
    calcularHuella: async (f) => `h-${f.name}-${f.size}-${f.lastModified}`,
    nuevoId: () => `id${++n}`,
    ...extra,
  });
  gestor.enlazar({ alRegistrar, alProcesar });
  const items = () => gestor.instantanea().items;
  const nombres = () => items().map((i) => i.nombre);
  const fases = () => items().map((i) => i.fase);
  return { gestor, m, almacen, procesar, alRegistrar, alProcesar, items, nombres, fases, registradas };
}

describe("agregar", () => {
  it("deja los archivos «por subir», ordenados por nombre de forma natural dentro de la selección", async () => {
    const t = montar();
    const r = await t.gestor.agregar([archivo("parte 10.m4a"), archivo("parte 2.m4a"), archivo("Parte 1.m4a")]);
    expect(r).toEqual({ agregados: 3, rechazos: [] });
    expect(t.nombres()).toEqual(["Parte 1.m4a", "parte 2.m4a", "parte 10.m4a"]);
    expect(t.fases()).toEqual(["porSubir", "porSubir", "porSubir"]);
  });

  it("lo que ya estaba en la lista conserva su sitio: una selección nueva va al final", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("b.m4a")]);
    await t.gestor.agregar([archivo("a.m4a")]);
    expect(t.nombres()).toEqual(["b.m4a", "a.m4a"]);
  });

  it("rechaza con un motivo lo que no es una grabación, está vacío o pesa demasiado", async () => {
    const t = montar();
    const r = await t.gestor.agregar([archivo("acta.pdf"), archivo("vacio.mp3", 0), archivo("enorme.wav", MAX_FUENTE_BYTES + 1), archivo("bien.mp3")]);
    expect(r.agregados).toBe(1);
    expect(r.rechazos).toHaveLength(3);
    expect(r.rechazos[0]).toMatch(/«acta\.pdf» no parece una grabación/);
    expect(r.rechazos[1]).toMatch(/«vacio\.mp3» está vacío/);
    expect(r.rechazos[2]).toMatch(/«enorme\.wav» pesa .*GB.*Pártelo en varios archivos/);
    expect(t.nombres()).toEqual(["bien.mp3"]);
  });

  it("no repite un archivo ya listado ni uno ya subido a la reunión", async () => {
    const t = montar({}, [{ name: "subido.m4a", sizeBytes: 40 * MB }]);
    await t.gestor.agregar([archivo("a.m4a")]);
    const r = await t.gestor.agregar([archivo("a.m4a"), archivo("subido.m4a"), archivo("a.m4a", 40 * MB, 1)]);
    expect([...r.rechazos].sort()).toEqual(["«a.m4a» ya está en la lista.", "«subido.m4a» ya está subido a esta reunión."]);
    // Mismo nombre y tamaño pero otra fecha de modificación: es otro archivo.
    expect(t.nombres()).toEqual(["a.m4a", "a.m4a"]);
  });

  it("el mismo archivo elegido dos veces en una selección entra una vez", async () => {
    const t = montar();
    const r = await t.gestor.agregar([archivo("a.m4a"), archivo("a.m4a")]);
    expect(r.agregados).toBe(1);
    expect(r.rechazos).toEqual(["«a.m4a» ya está en la lista."]);
  });

  it("respeta el tope de archivos por reunión contando los ya subidos", async () => {
    const registradas = Array.from({ length: MAX_FUENTES_POR_REUNION - 1 }, (_, i) => ({ name: `r${i}.mp3`, sizeBytes: 1 }));
    const t = montar({}, registradas);
    const r = await t.gestor.agregar([archivo("x.mp3"), archivo("y.mp3")]);
    expect(r.agregados).toBe(1);
    expect(r.rechazos).toEqual([`Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.`]);
  });

  it("si no se puede calcular la huella, el archivo se sube igual (sin poder reanudarse)", async () => {
    const t = montar({ calcularHuella: async () => { throw new Error("sin lectura"); } });
    expect((await t.gestor.agregar([archivo("a.m4a")])).agregados).toBe(1);
    expect(t.items()[0]).toMatchObject({ huella: null, clave: null });
  });

  it("detecta el tipo del archivo por su extensión", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("nota.m4a"), { ...archivo("zoom.mp4"), type: "video/mp4" }, archivo("iphone.MOV")]);
    expect(Object.fromEntries(t.items().map((i) => [i.nombre, i.tipo]))).toEqual({ "nota.m4a": "audio/mp4", "zoom.mp4": "video/mp4", "iphone.MOV": "video/quicktime" });
  });
});

describe("orden antes de empezar", () => {
  it("mover intercambia con el vecino «por subir» y nunca sale de la lista", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a"), archivo("c.m4a")]);
    const id = (n: string) => t.items().find((i) => i.nombre === n)!.id;
    t.gestor.mover(id("c.m4a"), -1);
    expect(t.nombres()).toEqual(["a.m4a", "c.m4a", "b.m4a"]);
    t.gestor.mover(id("a.m4a"), -1);
    t.gestor.mover(id("b.m4a"), 1);
    expect(t.nombres()).toEqual(["a.m4a", "c.m4a", "b.m4a"]);
  });

  it("una vez empezada la subida ya no se reordenan los archivos que están en cola", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.empezar();
    t.gestor.mover(t.items()[1].id, -1);
    expect(t.nombres()).toEqual(["a.m4a", "b.m4a"]);
  });
});

describe("subir en cola", () => {
  it("sube de uno en uno, en el orden de la lista, y cada archivo registrado avisa", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a"), archivo("c.m4a")]);
    t.gestor.mover(t.items()[2].id, -1); // a, c, b
    t.gestor.empezar();
    expect(t.m.lanzados).toHaveLength(1);
    expect(t.m.lanzados[0].opciones.archivo.name).toBe("a.m4a");
    expect(t.fases()).toEqual(["subiendo", "espera", "espera"]);

    t.m.lanzados[0].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    expect(t.m.lanzados).toHaveLength(2);
    expect(t.m.lanzados[1].opciones.archivo.name).toBe("c.m4a");
    expect(t.alRegistrar).toHaveBeenCalledTimes(1);
    expect(t.fases()).toEqual(["lista", "subiendo", "espera"]);

    t.m.lanzados[1].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    expect(t.m.lanzados[2].opciones.archivo.name).toBe("b.m4a");
    expect(t.m.lanzados.map((l) => l.opciones.meetingId)).toEqual(["m1", "m1", "m1"]);
  });

  it("refleja el avance del archivo activo (fase, porcentaje, velocidad) y el del lote entero", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a", 100 * MB), archivo("b.m4a", 100 * MB)]);
    t.gestor.empezar();
    t.m.lanzados[0].emitir({ subidos: 30 * MB, total: 100 * MB, porcentaje: 30, bytesPorSegundo: 10 * MB, restanteS: 7 });
    const f = t.gestor.instantanea();
    expect(f.items[0]).toMatchObject({ fase: "subiendo", progreso: { porcentaje: 30 } });
    expect(f).toMatchObject({ activa: true, subidosLote: 30 * MB, totalLote: 200 * MB, bytesPorSegundo: 10 * MB });
    // 170 MB por subir a 10 MB/s.
    expect(f.restanteLoteS).toBe(17);
  });

  it("muestra los avisos del motor (sin conexión, subida caducada) y que continúa una subida anterior", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].emitir({ mensaje: MENSAJE_SIN_CONEXION, reanudada: true });
    expect(t.gestor.instantanea()).toMatchObject({ mensajeActivo: MENSAJE_SIN_CONEXION, reanudando: true });
  });

  it("pausar y reanudar actúan sobre el archivo activo", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.pausar(); // sin nada activo: no hace nada
    t.gestor.empezar();
    t.gestor.pausar();
    expect(t.m.lanzados[0].control.pausas).toBe(1);
    expect(t.gestor.instantanea()).toMatchObject({ pausada: true, restanteLoteS: null });
    expect(t.items()[0].fase).toBe("pausada");
    t.gestor.pausar();
    expect(t.m.lanzados[0].control.pausas).toBe(1);
    t.gestor.reanudar();
    expect(t.m.lanzados[0].control.reanudas).toBe(1);
    expect(t.gestor.instantanea().pausada).toBe(false);
    expect(t.items()[0].fase).toBe("subiendo");
  });

  it("empezar sin archivos «por subir» no hace nada", async () => {
    const t = montar();
    t.gestor.empezar();
    expect(t.m.lanzados).toHaveLength(0);
  });

  it("si se agregan más archivos mientras sube, esperan a que se pulse otra vez", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.empezar();
    await t.gestor.agregar([archivo("b.m4a")]);
    expect(t.fases()).toEqual(["subiendo", "porSubir"]);
    t.m.lanzados[0].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    expect(t.m.lanzados).toHaveLength(1); // b no empezó
    expect(t.procesar).not.toHaveBeenCalled(); // y no se procesa con algo sin subir
    t.gestor.empezar();
    expect(t.m.lanzados).toHaveLength(2);
  });
});

describe("al terminar el lote se envía a procesar", () => {
  it("cuando TODO llegó, una sola vez", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    expect(t.procesar).not.toHaveBeenCalled();
    t.m.lanzados[1].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    await tick();
    expect(t.procesar).toHaveBeenCalledTimes(1);
    expect(t.alProcesar).toHaveBeenCalledTimes(1);
    expect(t.gestor.instantanea()).toMatchObject({ procesando: false, errorProceso: null });
  });

  it("si un archivo falla NO se procesa: faltaría una parte de la grabación", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: false, error: "Se cortó la conexión." });
    await tick();
    // La cola sigue con el siguiente aunque uno falle.
    expect(t.m.lanzados).toHaveLength(2);
    t.m.lanzados[1].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    await tick();
    expect(t.fases()).toEqual(["error", "lista"]);
    expect(t.items()[0].mensaje).toBe("Se cortó la conexión.");
    expect(t.gestor.instantanea().conError).toBe(1);
    expect(t.procesar).not.toHaveBeenCalled();
  });

  it("reintentar los fallidos los vuelve a poner en cola y, si todo sale bien, se procesa", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: false, error: "x" });
    await tick();
    t.m.lanzados[1].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    t.gestor.reintentarFallidos();
    expect(t.m.lanzados).toHaveLength(3);
    expect(t.m.lanzados[2].opciones.archivo.name).toBe("a.m4a");
    expect(t.items()[0]).toMatchObject({ fase: "subiendo", mensaje: null });
    t.m.lanzados[2].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    await tick();
    expect(t.procesar).toHaveBeenCalledTimes(1);
  });

  it("si procesar falla, queda el mensaje y se puede reintentar a mano", async () => {
    const procesar = vi.fn().mockRejectedValueOnce(new Error("Algún archivo todavía se está preparando.")).mockResolvedValueOnce(undefined);
    const t = montar({ procesar });
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    await tick();
    expect(t.gestor.instantanea().errorProceso).toBe("Algún archivo todavía se está preparando.");
    expect(t.alProcesar).not.toHaveBeenCalled();
    await t.gestor.procesarAhora();
    expect(procesar).toHaveBeenCalledTimes(2);
    expect(t.gestor.instantanea().errorProceso).toBeNull();
    expect(t.alProcesar).toHaveBeenCalledTimes(1);
  });

  it("procesar a mano dos veces seguidas no lo envía dos veces mientras la primera sigue en curso", async () => {
    let liberar!: () => void;
    const procesar = vi.fn(() => new Promise<void>((r) => (liberar = r)));
    const t = montar({ procesar });
    const a = t.gestor.procesarAhora();
    const b = t.gestor.procesarAhora();
    expect(t.gestor.instantanea().procesando).toBe(true);
    liberar();
    await Promise.all([a, b]);
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(t.gestor.instantanea().procesando).toBe(false);
  });

  it("no se procesa si el lote quedó vacío (todo se quitó)", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.empezar();
    t.gestor.quitar(t.items()[0].id);
    await tick();
    await tick();
    expect(t.procesar).not.toHaveBeenCalled();
  });
});

describe("quitar", () => {
  it("un archivo «por subir» se descarta con su avance guardado", async () => {
    const t = montar();
    const guardado = { clave: "m1:h-a.m4a-41943040-1700000000000" } as EstadoGuardado;
    const borrar = vi.spyOn(t.almacen, "borrar");
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.quitar(t.items()[0].id);
    expect(t.items()).toEqual([]);
    expect(borrar).toHaveBeenCalledWith(guardado.clave);
  });

  it("el archivo activo se cancela y la cola sigue con el siguiente", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.empezar();
    t.gestor.quitar(t.items()[0].id);
    expect(t.m.lanzados[0].control.cancelaciones).toBe(1);
    await tick();
    expect(t.m.lanzados).toHaveLength(2);
    expect(t.m.lanzados[1].opciones.archivo.name).toBe("b.m4a");
    expect(t.nombres()).toEqual(["b.m4a"]);
    expect(t.alRegistrar).not.toHaveBeenCalled();
  });

  it("quitar el que falló limpia su error y deja procesar el resto", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a"), archivo("b.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: false, error: "x" });
    await tick();
    t.m.lanzados[1].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    expect(t.procesar).not.toHaveBeenCalled();
    t.gestor.quitar(t.items().find((i) => i.fase === "error")!.id);
    await tick();
    await tick();
    expect(t.procesar).toHaveBeenCalledTimes(1);
  });

  it("quitar algo que no existe no rompe", async () => {
    const t = montar();
    t.gestor.quitar("nada");
    t.gestor.mover("nada", 1);
    expect(t.items()).toEqual([]);
  });
});

describe("subidas interrumpidas de una visita anterior", () => {
  const guardada = (nombre: string, extra: Partial<EstadoGuardado> = {}): EstadoGuardado => ({
    clave: `m1:h-${nombre}-${40 * MB}-1700000000000`, meetingId: "m1", huella: "h", nombre, tamano: 40 * MB, tipo: "audio/mp4", ultimaModif: 1_700_000_000_000,
    tamParte: 16 * MB, pathname: "meetings/m1/fuentes/aaaaaaaa-x", key: "k", uploadId: "u", partes: [{ partNumber: 1, etag: "e1" }, { partNumber: 2, etag: "e2" }],
    completado: null, creado: Date.now(), actualizado: Date.now(), ...extra,
  });

  it("aparecen con el porcentaje que ya subieron", async () => {
    const t = montar();
    await t.almacen.guardar(guardada("consejo.m4a"));
    await t.gestor.cargarInterrumpidas();
    expect(t.items()).toHaveLength(1);
    expect(t.items()[0]).toMatchObject({ fase: "interrumpida", nombre: "consejo.m4a", subidoPrevio: 80 }); // 32 de 40 MB
    expect(t.gestor.instantanea().interrumpidas).toBe(1);
  });

  it("una subida ya completa en Blob (solo faltaba registrar) se muestra al 100 %", async () => {
    const t = montar();
    await t.almacen.guardar(guardada("c.m4a", { completado: { url: "u", pathname: "p" } }));
    await t.gestor.cargarInterrumpidas();
    expect(t.items()[0].subidoPrevio).toBe(100);
  });

  it("al volver a elegir el MISMO archivo, reemplaza a la interrumpida (y el motor la retoma por su huella)", async () => {
    const t = montar();
    await t.almacen.guardar(guardada("consejo.m4a"));
    await t.gestor.cargarInterrumpidas();
    await t.gestor.agregar([archivo("consejo.m4a")]);
    expect(t.fases()).toEqual(["porSubir"]);
    // El rastro guardado NO se borra: el motor lo usa para continuar.
    expect(await t.almacen.listar("m1")).toHaveLength(1);
  });

  it("un archivo distinto no toca a la interrumpida", async () => {
    const t = montar();
    await t.almacen.guardar(guardada("consejo.m4a"));
    await t.gestor.cargarInterrumpidas();
    await t.gestor.agregar([archivo("otro.m4a")]);
    expect(t.fases()).toEqual(["interrumpida", "porSubir"]);
  });

  it("si ya quedó registrada (otra pestaña), se descarta el rastro local en vez de mostrarla", async () => {
    const t = montar({}, [{ name: "consejo.m4a", sizeBytes: 40 * MB }]);
    await t.almacen.guardar(guardada("consejo.m4a"));
    await t.gestor.cargarInterrumpidas();
    expect(t.items()).toEqual([]);
    expect(await t.almacen.listar("m1")).toEqual([]);
  });

  it("descartarla con la × borra su avance guardado", async () => {
    const t = montar();
    await t.almacen.guardar(guardada("consejo.m4a"));
    await t.gestor.cargarInterrumpidas();
    t.gestor.quitar(t.items()[0].id);
    await tick();
    expect(await t.almacen.listar("m1")).toEqual([]);
    expect(t.items()).toEqual([]);
  });

  it("BLOQUEAN el envío automático: transcribir sin esa parte sería peor que esperar", async () => {
    const t = montar();
    await t.almacen.guardar(guardada("parte-2.m4a"));
    await t.gestor.cargarInterrumpidas();
    await t.gestor.agregar([archivo("parte-1.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: true, url: "u", pathname: "p" });
    await tick();
    await tick();
    expect(t.procesar).not.toHaveBeenCalled();
    expect(t.gestor.instantanea().interrumpidas).toBe(1);
    // Al descartarla, ya nada falta y se procesa.
    t.gestor.quitar(t.items().find((i) => i.fase === "interrumpida")!.id);
    await tick();
    await tick();
    expect(t.procesar).toHaveBeenCalledTimes(1);
  });

  it("no duplica lo que ya está en la lista como error (conserva su clave)", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.empezar();
    t.m.lanzados[0].terminar({ ok: false, error: "x" });
    await tick();
    await t.almacen.guardar(guardada("a.m4a"));
    await t.gestor.cargarInterrumpidas();
    expect(t.fases()).toEqual(["error"]);
  });

  it("si el almacén falla al listar, no se rompe", async () => {
    const t = montar();
    vi.spyOn(t.almacen, "listar").mockRejectedValue(new Error("IDB cerrada"));
    await t.gestor.cargarInterrumpidas();
    expect(t.items()).toEqual([]);
  });
});

describe("suscripción", () => {
  it("avisa de cada cambio y deja de avisar al darse de baja; la foto cambia solo cuando algo cambia", async () => {
    const t = montar();
    const f = vi.fn();
    const baja = t.gestor.suscribir(f);
    const foto0 = t.gestor.instantanea();
    expect(t.gestor.instantanea()).toBe(foto0);
    await t.gestor.agregar([archivo("a.m4a")]);
    expect(f).toHaveBeenCalled();
    expect(t.gestor.instantanea()).not.toBe(foto0);
    const llamadas = f.mock.calls.length;
    baja();
    t.gestor.empezar();
    expect(f.mock.calls.length).toBe(llamadas);
  });

  it("al detener, cancela lo que esté subiéndose", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a")]);
    t.gestor.empezar();
    t.gestor.detener();
    expect(t.m.lanzados[0].control.cancelaciones).toBe(1);
  });
});

describe("tipos exportados", () => {
  it("un ItemSubida tiene todo lo que la pantalla necesita", async () => {
    const t = montar();
    await t.gestor.agregar([archivo("a.m4a")]);
    const it: ItemSubida = t.items()[0];
    expect(Object.keys(it).sort()).toEqual(["clave", "fase", "huella", "id", "mensaje", "nombre", "progreso", "subidoPrevio", "tamano", "tipo"]);
  });
});
