/**
 * Base local de Reuniones en el navegador (IndexedDB).
 *
 * Guarda lo que tiene que sobrevivir al cierre de la pestaña: el estado de las subidas a medias
 * (hoy) y, más adelante, las partes de la grabadora. Una sola base («soph-reuniones») con un almacén
 * por tema; subir la versión es la forma de añadir almacenes sin perder lo anterior.
 *
 * Si IndexedDB no está (modo privado de algunos navegadores, políticas de empresa) o falla, todo cae
 * a memoria: la subida funciona igual, solo que no se puede reanudar tras cerrar la pestaña.
 */
import { AlmacenEnMemoria, type AlmacenEstados, type EstadoGuardado } from "./subida-reanudable";

const NOMBRE_BD = "soph-reuniones";
const VERSION_BD = 1;
const ALMACEN_SUBIDAS = "subidas";
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
    };
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rechazar(pedido.error ?? new Error("No se pudo abrir la base local."));
    pedido.onblocked = () => rechazar(new Error("La base local está bloqueada por otra pestaña."));
  }).catch((e) => {
    abierta = null; // que el próximo intento pueda volver a probar
    throw e;
  });
  return abierta;
}

function pedir<T>(fn: (almacen: IDBObjectStore) => IDBRequest<T>, modo: IDBTransactionMode): Promise<T> {
  return abrirBD().then(
    (bd) =>
      new Promise<T>((resolver, rechazar) => {
        const tx = bd.transaction(ALMACEN_SUBIDAS, modo);
        const r = fn(tx.objectStore(ALMACEN_SUBIDAS));
        tx.oncomplete = () => resolver(r.result);
        tx.onerror = () => rechazar(tx.error ?? new Error("Falló la base local."));
        tx.onabort = () => rechazar(tx.error ?? new Error("Se canceló la operación en la base local."));
      }),
  );
}

class AlmacenIndexedDB implements AlmacenEstados {
  leer(clave: string) {
    return pedir<EstadoGuardado | undefined>((a) => a.get(clave), "readonly");
  }
  async guardar(estado: EstadoGuardado) {
    await pedir((a) => a.put(estado), "readwrite");
  }
  async borrar(clave: string) {
    await pedir((a) => a.delete(clave), "readwrite");
  }
  async listar(meetingId: string) {
    const todas = await pedir<EstadoGuardado[]>((a) => a.index("meetingId").getAll(meetingId), "readonly");
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
