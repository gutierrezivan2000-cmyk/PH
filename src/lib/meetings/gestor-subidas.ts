/**
 * Gestor de las subidas de UNA reunión: la cola, el lote y lo que pasa al terminar.
 *
 * El motor (subida-reanudable.ts) sabe subir UN archivo. Este gestor decide el resto:
 *  - los archivos elegidos esperan en una lista («por subir») que se puede ordenar antes de empezar;
 *  - al pulsar «Subir y transcribir» se suben de uno en uno, en el orden de la lista (el orden de la
 *    reunión es el de subida);
 *  - las subidas que quedaron a medias de una visita anterior se muestran como «interrumpidas» y se
 *    reanudan solas al volver a elegir el mismo archivo;
 *  - cuando todo llegó, la reunión se envía a procesar sola, SALVO que falte algo (un error, una subida
 *    interrumpida, archivos sin subir): transcribir sin una parte de la grabación es peor que esperar.
 *
 * Es una pieza sin React: guarda su estado, avisa a quien escuche y se prueba con motores simulados.
 * El gancho de React (useSubidas) y el registro por reunión viven aparte.
 */
import { esArchivoDeReunion, formatoTamano, tipoDeArchivoReunion } from "@/lib/upload-limits";
import { MAX_FUENTE_BYTES, MAX_FUENTES_POR_REUNION } from "./tipos";
import {
  huella as huellaReal, iniciarSubida, planificarPartes,
  type AlmacenEstados, type ApiSubida, type ArchivoSubible, type ControlSubida, type Entorno, type EstadoGuardado, type Progreso,
} from "./subida-reanudable";

export type FaseItem = "porSubir" | "espera" | "subiendo" | "pausada" | "lista" | "error" | "interrumpida";

export type ItemSubida = {
  id: string;
  nombre: string;
  tamano: number;
  tipo: string;
  fase: FaseItem;
  progreso: Progreso | null;
  /** Motivo del error (fase «error»). */
  mensaje: string | null;
  huella: string | null;
  /** `${meetingId}:${huella}`: lo que identifica la subida en el almacén local. */
  clave: string | null;
  /** Fase «interrumpida»: el porcentaje (0-100) que ya había subido. */
  subidoPrevio: number | null;
};

export type InstantaneaGestor = {
  items: ItemSubida[];
  /** Hay un archivo subiéndose (o en pausa). */
  activa: boolean;
  pausada: boolean;
  porSubir: number;
  enEspera: number;
  conError: number;
  interrumpidas: number;
  /** Bytes subidos / totales de lo que está en curso o ya subió en este lote. */
  subidosLote: number;
  totalLote: number;
  bytesPorSegundo: number;
  /** Lo que falta del LOTE entero (no solo del archivo activo). */
  restanteLoteS: number | null;
  /** Mensaje del archivo activo (sin conexión, subida caducada…). */
  mensajeActivo: string | null;
  reanudando: boolean;
  /** Enviando la reunión a procesar. */
  procesando: boolean;
  errorProceso: string | null;
};

/** Lo que el gestor necesita del archivo elegido: lo de `File` que usa el motor, más el tipo MIME. */
export type ArchivoElegido = ArchivoSubible & { type?: string };

export type DependenciasGestor = {
  meetingId: string;
  almacen: AlmacenEstados;
  api: ApiSubida;
  /** Envía la reunión a procesar (POST /process). Lanza con un mensaje legible si falla. */
  procesar: () => Promise<void>;
  /** Archivos ya registrados en la reunión (para no duplicarlos ni pasar el tope). */
  fuentesRegistradas: () => Array<{ name: string; sizeBytes: number }>;
  entorno?: Entorno;
  /** Para pruebas. */
  iniciar?: typeof iniciarSubida;
  calcularHuella?: (archivo: ArchivoSubible) => Promise<string>;
  nuevoId?: () => string;
};

export type Enlaces = {
  /** Un archivo quedó registrado en el servidor (refrescar la reunión). */
  alRegistrar?: () => void;
  /** La reunión se envió a procesar. */
  alProcesar?: () => void;
};

const orden = (a: ArchivoElegido, b: ArchivoElegido) => a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });

export function crearGestor(dep: DependenciasGestor) {
  const iniciar = dep.iniciar ?? iniciarSubida;
  const calcularHuella = dep.calcularHuella ?? huellaReal;
  let contador = 0;
  const nuevoId = dep.nuevoId ?? (() => `subida-${Date.now().toString(36)}-${++contador}`);

  let items: ItemSubida[] = [];
  const archivos = new Map<string, ArchivoElegido>();
  const controles = new Map<string, ControlSubida>();
  let activoId: string | null = null;
  let pausada = false;
  /** Se pulsó «Subir y transcribir» y falta cerrar el lote. */
  let lote = false;
  let procesando = false;
  let errorProceso: string | null = null;
  let enlaces: Enlaces = {};

  const oyentes = new Set<() => void>();
  let foto: InstantaneaGestor = calcular();

  /* ── estado visible ───────────────────────────────────────────────── */

  function calcular(): InstantaneaGestor {
    const enLote = items.filter((i) => i.fase === "espera" || i.fase === "subiendo" || i.fase === "pausada" || i.fase === "lista");
    const subidosLote = enLote.reduce((s, i) => s + (i.fase === "lista" ? i.tamano : (i.progreso?.subidos ?? 0)), 0);
    const totalLote = enLote.reduce((s, i) => s + i.tamano, 0);
    const activo = items.find((i) => i.id === activoId) ?? null;
    const velocidad = activo?.progreso?.bytesPorSegundo ?? 0;
    return {
      items,
      activa: activoId !== null,
      pausada,
      porSubir: items.filter((i) => i.fase === "porSubir").length,
      enEspera: items.filter((i) => i.fase === "espera").length,
      conError: items.filter((i) => i.fase === "error").length,
      interrumpidas: items.filter((i) => i.fase === "interrumpida").length,
      subidosLote,
      totalLote,
      bytesPorSegundo: velocidad,
      restanteLoteS: !pausada && velocidad > 0 && totalLote > subidosLote ? Math.ceil((totalLote - subidosLote) / velocidad) : null,
      mensajeActivo: activo?.progreso?.mensaje ?? null,
      reanudando: Boolean(activo?.progreso?.reanudada),
      procesando,
      errorProceso,
    };
  }

  function notificar() {
    foto = calcular();
    oyentes.forEach((f) => f());
  }

  function poner(id: string, cambios: Partial<ItemSubida>) {
    items = items.map((i) => (i.id === id ? { ...i, ...cambios } : i));
    notificar();
  }

  /* ── agregar ──────────────────────────────────────────────────────── */

  async function agregar(elegidos: ArchivoElegido[]): Promise<{ agregados: number; rechazos: string[] }> {
    const rechazos: string[] = [];
    const registradas = dep.fuentesRegistradas();
    const candidatos: ArchivoElegido[] = [];
    let ocupados = registradas.length + items.filter((i) => i.fase !== "interrumpida").length;

    for (const f of elegidos) {
      if (!esArchivoDeReunion(f.name)) {
        rechazos.push(`«${f.name}» no parece una grabación: sube audio o video (MP3, M4A, WAV, MP4, MOV…).`);
      } else if (f.size < 1) {
        rechazos.push(`«${f.name}» está vacío.`);
      } else if (f.size > MAX_FUENTE_BYTES) {
        rechazos.push(`«${f.name}» pesa ${formatoTamano(f.size)} y el máximo por archivo es ${formatoTamano(MAX_FUENTE_BYTES)}. Pártelo en varios archivos y súbelos todos.`);
      } else if (registradas.some((r) => r.name === f.name && r.sizeBytes === f.size)) {
        rechazos.push(`«${f.name}» ya está subido a esta reunión.`);
      } else if (ocupados >= MAX_FUENTES_POR_REUNION) {
        rechazos.push(`Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.`);
        break;
      } else {
        candidatos.push(f);
        ocupados++;
      }
    }

    // Dentro de una misma selección se ordenan por nombre («parte 2» antes que «parte 10»); lo ya listado conserva su sitio.
    candidatos.sort(orden);

    const nuevos: ItemSubida[] = [];
    for (const f of candidatos) {
      let hue: string | null = null;
      try {
        hue = await calcularHuella(f);
      } catch {
        /* sin huella no se puede reanudar, pero el archivo se sube igual */
      }
      const clave = hue ? `${dep.meetingId}:${hue}` : null;
      if (clave && [...items, ...nuevos].some((i) => i.clave === clave && i.fase !== "interrumpida")) {
        rechazos.push(`«${f.name}» ya está en la lista.`);
        continue;
      }
      const id = nuevoId();
      archivos.set(id, f);
      nuevos.push({ id, nombre: f.name, tamano: f.size, tipo: tipoDeArchivoReunion({ name: f.name, type: f.type }), fase: "porSubir", progreso: null, mensaje: null, huella: hue, clave, subidoPrevio: null });
    }

    // Un archivo que coincide con una subida interrumpida la reemplaza: el motor la retoma por su huella.
    items = [...items.filter((i) => !(i.fase === "interrumpida" && nuevos.some((n) => n.clave === i.clave))), ...nuevos];
    errorProceso = null;
    notificar();
    return { agregados: nuevos.length, rechazos };
  }

  /* ── interrumpidas ────────────────────────────────────────────────── */

  const porcentajeGuardado = (g: EstadoGuardado): number => {
    if (g.completado) return 100;
    try {
      const hechas = new Set(g.partes.map((p) => p.partNumber));
      const bytes = planificarPartes(g.tamano, g.tamParte).filter((p) => hechas.has(p.numero)).reduce((s, p) => s + p.bytes, 0);
      return Math.min(99, Math.floor((bytes / g.tamano) * 100));
    } catch {
      return 0;
    }
  };

  async function cargarInterrumpidas(): Promise<void> {
    const guardadas = await dep.almacen.listar(dep.meetingId).catch(() => [] as EstadoGuardado[]);
    const registradas = dep.fuentesRegistradas();
    const conocidas = new Set(items.filter((i) => i.fase !== "interrumpida" && i.clave).map((i) => i.clave));
    const vigentes: ItemSubida[] = [];
    for (const g of guardadas) {
      if (conocidas.has(g.clave)) continue;
      // Ya quedó registrado (por ejemplo desde otra pestaña): el rastro local sobra.
      if (registradas.some((r) => r.name === g.nombre && r.sizeBytes === g.tamano)) {
        void dep.almacen.borrar(g.clave).catch(() => {});
        continue;
      }
      vigentes.push({
        id: `interrumpida-${g.clave}`, nombre: g.nombre, tamano: g.tamano, tipo: g.tipo, fase: "interrumpida", progreso: null,
        mensaje: null, huella: g.huella, clave: g.clave, subidoPrevio: porcentajeGuardado(g),
      });
    }
    items = [...vigentes, ...items.filter((i) => i.fase !== "interrumpida")];
    notificar();
  }

  /* ── cola ─────────────────────────────────────────────────────────── */

  const faseDe = (p: Progreso): FaseItem => (p.estado === "pausada" ? "pausada" : p.estado === "lista" ? "lista" : p.estado === "error" ? "error" : "subiendo");

  function bombear() {
    if (activoId) return;
    const siguiente = items.find((i) => i.fase === "espera");
    const archivo = siguiente ? archivos.get(siguiente.id) : undefined;
    if (!siguiente || !archivo) return;

    const id = siguiente.id;
    activoId = id;
    pausada = false;
    poner(id, { fase: "subiendo", mensaje: null });

    const control = iniciar({
      meetingId: dep.meetingId, archivo, tipo: siguiente.tipo, api: dep.api, almacen: dep.almacen, entorno: dep.entorno,
      alProgreso: (p) => {
        if (activoId === id) poner(id, { progreso: p, fase: faseDe(p) });
      },
    });
    controles.set(id, control);

    void control.terminada.then((r) => {
      controles.delete(id);
      if (activoId === id) activoId = null;
      pausada = false;
      if (r.ok) {
        poner(id, { fase: "lista", mensaje: null });
        enlaces.alRegistrar?.();
      } else if (!r.cancelada) {
        poner(id, { fase: "error", mensaje: r.error });
      } else {
        notificar();
      }
      bombear();
      void cerrarLote();
    });
  }

  /** Cuando no queda nada por hacer en el lote y todo salió bien, se envía a procesar. */
  async function cerrarLote(): Promise<void> {
    if (!lote || activoId) return;
    const pendiente = items.some((i) => i.fase !== "lista");
    if (pendiente) return;
    if (!items.some((i) => i.fase === "lista")) return;
    lote = false;
    await procesarAhora();
  }

  async function procesarAhora(): Promise<void> {
    if (procesando) return;
    procesando = true;
    errorProceso = null;
    notificar();
    try {
      await dep.procesar();
      procesando = false;
      notificar();
      enlaces.alProcesar?.();
    } catch (e) {
      procesando = false;
      errorProceso = e instanceof Error && e.message ? e.message : "No pudimos enviar la reunión a procesar. Inténtalo de nuevo.";
      notificar();
    }
  }

  /* ── acciones de la persona ───────────────────────────────────────── */

  function empezar() {
    if (!items.some((i) => i.fase === "porSubir")) return;
    items = items.map((i) => (i.fase === "porSubir" ? { ...i, fase: "espera" as const } : i));
    lote = true;
    errorProceso = null;
    notificar();
    bombear();
  }

  function quitar(id: string) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    const control = controles.get(id);
    items = items.filter((i) => i.id !== id);
    archivos.delete(id);
    if (control) {
      control.cancelar(); // el motor termina «cancelada», borra su avance y la cola sigue con el siguiente
    } else if (it.fase !== "lista" && it.clave) {
      // Se descarta la subida: también su avance guardado (si no, volvería a aparecer como «interrumpida»).
      void dep.almacen.borrar(it.clave).catch(() => {});
    }
    notificar();
    void cerrarLote();
  }

  function mover(id: string, delta: -1 | 1) {
    const i = items.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return;
    if (items[i].fase !== "porSubir" || items[j].fase !== "porSubir") return;
    const copia = [...items];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    items = copia;
    notificar();
  }

  function pausar() {
    if (!activoId || pausada) return;
    pausada = true;
    controles.get(activoId)?.pausar();
    notificar();
  }

  function reanudar() {
    if (!activoId || !pausada) return;
    pausada = false;
    controles.get(activoId)?.reanudar();
    notificar();
  }

  /** Vuelve a poner en la cola los archivos que fallaron (conservan su avance guardado). */
  function reintentarFallidos() {
    if (!items.some((i) => i.fase === "error" && archivos.has(i.id))) return;
    items = items.map((i) => (i.fase === "error" && archivos.has(i.id) ? { ...i, fase: "espera" as const, mensaje: null, progreso: null } : i));
    lote = true;
    errorProceso = null;
    notificar();
    bombear();
  }

  /** Cancela todo lo que esté subiéndose (al cerrar la reunión definitivamente). */
  function detener() {
    for (const c of controles.values()) c.cancelar();
  }

  return {
    suscribir(f: () => void) {
      oyentes.add(f);
      return () => {
        oyentes.delete(f);
      };
    },
    instantanea: () => foto,
    /** Quien muestra la reunión se engancha para enterarse de los registros y del envío a procesar. */
    enlazar(e: Enlaces) {
      enlaces = e;
    },
    agregar,
    cargarInterrumpidas,
    empezar,
    quitar,
    mover,
    pausar,
    reanudar,
    reintentarFallidos,
    procesarAhora,
    detener,
  };
}

export type Gestor = ReturnType<typeof crearGestor>;
