/**
 * Base local de Reuniones en el navegador (IndexedDB).
 *
 * Guarda lo que tiene que sobrevivir al cierre de la pestaña: el estado de las subidas a medias y los trozos
 * de la grabadora (sesiones, trozos de 5 s y marcas). Una sola base («soph-reuniones») con un almacén por tema;
 * subir la versión es la forma de añadir almacenes sin perder lo anterior.
 *
 * Si IndexedDB no está (modo privado de algunos navegadores, políticas de empresa) o falla, todo cae a
 * memoria: la subida y la grabación funcionan igual, solo que no se pueden retomar tras cerrar la pestaña.
 */
import {
  AlmacenGrabacionesEnMemoria, type AlmacenGrabaciones, type MarcaGuardada, type SesionGuardada, type TrozoGuardado,
} from "./grabadora";
import { AlmacenEnMemoria, type AlmacenEstados, type EstadoGuardado } from "./subida-reanudable";

const NOMBRE_BD = "soph-reuniones";
const VERSION_BD = 2;
const ALMACEN_SUBIDAS = "subidas";
const ALMACEN_SESIONES = "grab-sesiones";
const ALMACEN_TROZOS = "grab-trozos";
const ALMACEN_MARCAS = "grab-marcas";
/** Una subida sin tocar por tanto tiempo ya no se puede reanudar (el servicio descarta las partes viejas). */
const CADUCIDAD_MS = 14 * 24 * 60 * 60 * 1000;

let abierta: Promise<IDBDatabase> | null = null;

function abrirBD(): Promise<IDBDatabase> {
  abierta ??= new Promise<IDBDatabase>((resolver, rechazar) => {
    const pedido = indexedDB.open(NOMBRE_BD, VERSION_BD);
    pedido.onupgradeneeded = () => {
      const bd = pedido.result;
      if (!bd.objectStoreNames.contains(ALMACEN_SUBIDAS)) {
        bd.createObjectStore(ALMACEN_SUBIDAS, { keyPath: "clave" }).createIndex("meetingId", "meetingId");
      }
      if (!bd.objectStoreNames.contains(ALMACEN_SESIONES)) {
        bd.createObjectStore(ALMACEN_SESIONES, { keyPath: "clave" }).createIndex("meetingId", "meetingId");
      }
      if (!bd.objectStoreNames.contains(ALMACEN_TROZOS)) {
        // La clave compuesta ordena los trozos por reunión, sesión y posición: leer un rango es leer en orden.
        bd.createObjectStore(ALMACEN_TROZOS, { keyPath: ["meetingId", "session", "idx"] });
      }
      if (!bd.objectStoreNames.contains(ALMACEN_MARCAS)) {
        bd.createObjectStore(ALMACEN_MARCAS, { keyPath: "id" }).createIndex("meetingId", "meetingId");
      }
    };
    pedido.onsuccess = () => {
      const bd = pedido.result;
      // Otra pestaña sube la versión, o el navegador cerró la conexión (Safari lo hace al pasar a segundo plano): la próxima operación reabre.
      bd.onversionchange = () => {
        bd.close();
        abierta = null;
      };
      bd.onclose = () => {
        abierta = null;
      };
      resolver(bd);
    };
    pedido.onerror = () => rechazar(pedido.error ?? new Error("No se pudo abrir la base local."));
    pedido.onblocked = () => rechazar(new Error("La base local está bloqueada por otra pestaña."));
  }).catch((e) => {
    abierta = null; // que el próximo intento pueda volver a probar
    throw e;
  });
  return abierta;
}

/** ¿Es un error de «la conexión con la base se cerró»? Se reabre y se repite una vez. */
function conexionPerdida(e: unknown): boolean {
  const nombre = (e as { name?: unknown } | null)?.name;
  const mensaje = e instanceof Error ? e.message : "";
  return nombre === "InvalidStateError" || nombre === "UnknownError" || /connection/i.test(mensaje);
}

function intentar<T>(
  almacenes: string[],
  modo: IDBTransactionMode,
  hacer: (tx: IDBTransaction) => IDBRequest<T> | null,
  durable: boolean,
): Promise<T | undefined> {
  return abrirBD().then(
    (bd) =>
      new Promise<T | undefined>((resolver, rechazar) => {
        let tx: IDBTransaction;
        try {
          // «strict»: el trozo llega al disco antes de darse por guardado (lo que se pierde en un apagón es lo que no se pudo guardar).
          tx = bd.transaction(almacenes, modo, durable ? { durability: "strict" } : undefined);
        } catch (e) {
          rechazar(e);
          return;
        }
        const r = hacer(tx);
        tx.oncomplete = () => resolver(r ? r.result : undefined);
        tx.onerror = () => rechazar(tx.error ?? new Error("Falló la base local."));
        tx.onabort = () => rechazar(tx.error ?? new Error("Se canceló la operación en la base local."));
      }),
  );
}

async function ejecutar<T>(
  almacenes: string[],
  modo: IDBTransactionMode,
  hacer: (tx: IDBTransaction) => IDBRequest<T> | null,
  durable = false,
): Promise<T | undefined> {
  try {
    return await intentar(almacenes, modo, hacer, durable);
  } catch (e) {
    if (!conexionPerdida(e)) throw e;
    abierta = null;
    return intentar(almacenes, modo, hacer, durable);
  }
}

const pedir = <T>(fn: (almacen: IDBObjectStore) => IDBRequest<T>, modo: IDBTransactionMode) =>
  ejecutar([ALMACEN_SUBIDAS], modo, (tx) => fn(tx.objectStore(ALMACEN_SUBIDAS)));

/* ════════════════════════════════════════════════════════════════════
   Subidas a medias
   ════════════════════════════════════════════════════════════════════ */

class AlmacenIndexedDB implements AlmacenEstados {
  leer(clave: string) {
    return pedir<EstadoGuardado | undefined>((a) => a.get(clave), "readonly") as Promise<EstadoGuardado | undefined>;
  }
  async guardar(estado: EstadoGuardado) {
    await pedir((a) => a.put(estado), "readwrite");
  }
  async borrar(clave: string) {
    await pedir((a) => a.delete(clave), "readwrite");
  }
  async listar(meetingId: string) {
    const todas = ((await pedir<EstadoGuardado[]>((a) => a.index("meetingId").getAll(meetingId), "readonly")) ?? []) as EstadoGuardado[];
    const limite = Date.now() - CADUCIDAD_MS;
    const vigentes: EstadoGuardado[] = [];
    for (const e of todas) {
      if (e.actualizado < limite) void this.borrar(e.clave).catch(() => {});
      else vigentes.push(e);
    }
    return vigentes.sort((a, b) => b.actualizado - a.actualizado);
  }
}

/** Si IndexedDB falla en una operación, esa y las siguientes pasan a memoria (sin romper la subida). */
class AlmacenConRespaldo implements AlmacenEstados {
  private enMemoria: AlmacenEnMemoria | null = null;
  constructor(private readonly principal: AlmacenEstados) {}

  private async probar<T>(operacion: (a: AlmacenEstados) => Promise<T>): Promise<T> {
    if (this.enMemoria) return operacion(this.enMemoria);
    try {
      return await operacion(this.principal);
    } catch {
      this.enMemoria = new AlmacenEnMemoria();
      return operacion(this.enMemoria);
    }
  }
  leer(clave: string) {
    return this.probar((a) => a.leer(clave));
  }
  guardar(estado: EstadoGuardado) {
    return this.probar((a) => a.guardar(estado));
  }
  borrar(clave: string) {
    return this.probar((a) => a.borrar(clave));
  }
  listar(meetingId: string) {
    return this.probar((a) => a.listar(meetingId));
  }
}

let unico: AlmacenEstados | null = null;

/** El almacén de subidas del navegador: IndexedDB con respaldo en memoria. */
export function almacenDeSubidas(): AlmacenEstados {
  unico ??= typeof indexedDB === "undefined" ? new AlmacenEnMemoria() : new AlmacenConRespaldo(new AlmacenIndexedDB());
  return unico;
}

/* ════════════════════════════════════════════════════════════════════
   Grabaciones: sesiones, trozos de 5 s y marcas
   ════════════════════════════════════════════════════════════════════ */

const claveSesion = (meetingId: string, session: number) => `${meetingId}|${session}`;
type SesionConClave = SesionGuardada & { clave: string };
function sinClave(fila: SesionConClave): SesionGuardada {
  const sesion: Partial<SesionConClave> = { ...fila };
  delete sesion.clave;
  return sesion as SesionGuardada;
}
const TOPE = Number.MAX_SAFE_INTEGER;
const rangoDeSesion = (meetingId: string, session: number) => IDBKeyRange.bound([meetingId, session, 0], [meetingId, session, TOPE]);

class GrabacionesIndexedDB implements AlmacenGrabaciones {
  async guardarSesion(s: SesionGuardada) {
    const fila: SesionConClave = { ...s, clave: claveSesion(s.meetingId, s.session) };
    await ejecutar([ALMACEN_SESIONES], "readwrite", (tx) => tx.objectStore(ALMACEN_SESIONES).put(fila), true);
  }

  async listarSesiones(meetingId: string) {
    const filas = (await ejecutar<SesionConClave[]>([ALMACEN_SESIONES], "readonly", (tx) =>
      tx.objectStore(ALMACEN_SESIONES).index("meetingId").getAll(meetingId),
    )) ?? [];
    return filas.map(sinClave).sort((a, b) => a.session - b.session);
  }

  async listarPendientes() {
    const filas = (await ejecutar<SesionConClave[]>([ALMACEN_SESIONES], "readonly", (tx) => tx.objectStore(ALMACEN_SESIONES).getAll())) ?? [];
    return filas.map(sinClave).sort((a, b) => a.iniciada - b.iniciada);
  }

  async guardarTrozo(t: TrozoGuardado) {
    await ejecutar([ALMACEN_TROZOS], "readwrite", (tx) => tx.objectStore(ALMACEN_TROZOS).put(t), true);
  }

  async leerTrozos(meetingId: string, session: number, desdeIdx: number, hastaIdx: number) {
    if (hastaIdx < desdeIdx) return [];
    const rango = IDBKeyRange.bound([meetingId, session, desdeIdx], [meetingId, session, hastaIdx]);
    return (await ejecutar<TrozoGuardado[]>([ALMACEN_TROZOS], "readonly", (tx) => tx.objectStore(ALMACEN_TROZOS).getAll(rango))) ?? [];
  }

  async ultimoTrozo(meetingId: string, session: number) {
    // El último trozo es la clave más alta del rango de la sesión: se lee solo esa, sin traer los datos.
    const intento = () =>
      abrirBD().then(
        (bd) =>
          new Promise<number>((resolver, rechazar) => {
            const tx = bd.transaction([ALMACEN_TROZOS], "readonly");
            const pedido = tx.objectStore(ALMACEN_TROZOS).openKeyCursor(rangoDeSesion(meetingId, session), "prev");
            let ultimo = -1;
            pedido.onsuccess = () => {
              const cursor = pedido.result;
              if (cursor) ultimo = (cursor.key as unknown[])[2] as number;
            };
            tx.oncomplete = () => resolver(ultimo);
            tx.onerror = () => rechazar(tx.error ?? new Error("Falló la base local."));
            tx.onabort = () => rechazar(tx.error ?? new Error("Se canceló la operación en la base local."));
          }),
      );
    try {
      return await intento();
    } catch (e) {
      if (!conexionPerdida(e)) throw e;
      abierta = null;
      return intento();
    }
  }

  async guardarMarca(m: MarcaGuardada) {
    await ejecutar([ALMACEN_MARCAS], "readwrite", (tx) => tx.objectStore(ALMACEN_MARCAS).put(m), true);
  }

  async listarMarcas(meetingId: string) {
    const filas = (await ejecutar<MarcaGuardada[]>([ALMACEN_MARCAS], "readonly", (tx) =>
      tx.objectStore(ALMACEN_MARCAS).index("meetingId").getAll(meetingId),
    )) ?? [];
    return filas.sort((a, b) => a.atMs - b.atMs);
  }

  async borrarSesion(meetingId: string, session: number) {
    await ejecutar([ALMACEN_SESIONES, ALMACEN_TROZOS], "readwrite", (tx) => {
      tx.objectStore(ALMACEN_TROZOS).delete(rangoDeSesion(meetingId, session));
      return tx.objectStore(ALMACEN_SESIONES).delete(claveSesion(meetingId, session));
    });
  }

  async borrarReunion(meetingId: string) {
    await ejecutar([ALMACEN_SESIONES, ALMACEN_TROZOS, ALMACEN_MARCAS], "readwrite", (tx) => {
      tx.objectStore(ALMACEN_TROZOS).delete(IDBKeyRange.bound([meetingId, 0, 0], [meetingId, TOPE, TOPE]));
      // Sesiones y marcas se buscan por reunión con un cursor de claves y se borran una a una, en la misma transacción.
      for (const nombre of [ALMACEN_SESIONES, ALMACEN_MARCAS]) {
        const almacen = tx.objectStore(nombre);
        const pedido = almacen.index("meetingId").openKeyCursor(IDBKeyRange.only(meetingId));
        pedido.onsuccess = () => {
          const cursor = pedido.result;
          if (!cursor) return;
          almacen.delete(cursor.primaryKey);
          cursor.continue();
        };
      }
      return null;
    });
  }
}

/** Como el de subidas: IndexedDB con respaldo en memoria. `enMemoria` dice si ya se cayó a memoria. */
export class AlmacenGrabacionesNavegador implements AlmacenGrabaciones {
  private memoria: AlmacenGrabacionesEnMemoria | null;
  constructor(private readonly principal: AlmacenGrabaciones | null) {
    this.memoria = principal ? null : new AlmacenGrabacionesEnMemoria();
  }

  /** true = lo grabado NO sobrevive a cerrar la pestaña (no hay IndexedDB, o falló). */
  get enMemoria(): boolean {
    return this.memoria !== null;
  }

  private async probar<T>(operacion: (a: AlmacenGrabaciones) => Promise<T>): Promise<T> {
    if (this.memoria) return operacion(this.memoria);
    try {
      return await operacion(this.principal as AlmacenGrabaciones);
    } catch {
      this.memoria = new AlmacenGrabacionesEnMemoria();
      return operacion(this.memoria);
    }
  }
  guardarSesion(s: SesionGuardada) {
    return this.probar((a) => a.guardarSesion(s));
  }
  listarSesiones(meetingId: string) {
    return this.probar((a) => a.listarSesiones(meetingId));
  }
  listarPendientes() {
    return this.probar((a) => a.listarPendientes());
  }
  guardarTrozo(t: TrozoGuardado) {
    return this.probar((a) => a.guardarTrozo(t));
  }
  leerTrozos(meetingId: string, session: number, desdeIdx: number, hastaIdx: number) {
    return this.probar((a) => a.leerTrozos(meetingId, session, desdeIdx, hastaIdx));
  }
  ultimoTrozo(meetingId: string, session: number) {
    return this.probar((a) => a.ultimoTrozo(meetingId, session));
  }
  guardarMarca(m: MarcaGuardada) {
    return this.probar((a) => a.guardarMarca(m));
  }
  listarMarcas(meetingId: string) {
    return this.probar((a) => a.listarMarcas(meetingId));
  }
  borrarSesion(meetingId: string, session: number) {
    return this.probar((a) => a.borrarSesion(meetingId, session));
  }
  borrarReunion(meetingId: string) {
    return this.probar((a) => a.borrarReunion(meetingId));
  }
}

let unicoGrabaciones: AlmacenGrabacionesNavegador | null = null;

/** El almacén de grabaciones del navegador. */
export function almacenDeGrabaciones(): AlmacenGrabacionesNavegador {
  unicoGrabaciones ??= new AlmacenGrabacionesNavegador(typeof indexedDB === "undefined" ? null : new GrabacionesIndexedDB());
  return unicoGrabaciones;
}

/** Una grabación sin terminar en este dispositivo, resumida por reunión (para avisarlo en la lista). */
export type GrabacionPendiente = { meetingId: string; sesiones: number; durMs: number };

export async function grabacionesPendientes(almacen: AlmacenGrabaciones = almacenDeGrabaciones()): Promise<GrabacionPendiente[]> {
  const porReunion = new Map<string, GrabacionPendiente>();
  for (const s of await almacen.listarPendientes().catch(() => [] as SesionGuardada[])) {
    if (s.ultimoIdx < 0) continue; // una sesión que no llegó a grabar nada
    const previa = porReunion.get(s.meetingId) ?? { meetingId: s.meetingId, sesiones: 0, durMs: 0 };
    previa.sesiones += 1;
    previa.durMs += s.durMs;
    porReunion.set(s.meetingId, previa);
  }
  return [...porReunion.values()];
}
