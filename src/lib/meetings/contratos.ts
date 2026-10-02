/**
 * Lo que comparten la cola, el trabajador y todos los manejadores: el contexto con que se ejecuta una tarea, el
 * resultado que puede devolver y cómo se clasifica un fallo (reintentable o no).
 */
import { ErrorAlmacen, type Almacen } from "./almacen";
import type { TareaReclamada } from "./cola";
import { ErrorAudio } from "./ffmpeg";
import { ErrorIA, type ClienteIA } from "./ia";
import { ErrorTranscripcion, type ProveedorDeTranscripcion } from "./transcripcion/tipos";

export type DepsProceso = {
  almacen: Almacen;
  ahora: () => Date;
  /** Para pruebas: otra ruta de ffmpeg y otro tamaño de segmento. */
  ffmpeg?: string;
  tramoMs?: number;
  /** Para pruebas: otro proveedor de transcripción (por omisión, el que elige `elegirProveedor`). */
  proveedor?: ProveedorDeTranscripcion;
  /** Para pruebas: otro cliente de IA (por omisión, Claude). */
  ia?: ClienteIA;
};

export type ContextoTarea = {
  tarea: TareaReclamada;
  /** Cuánto tiempo (ms) tiene esta pasada para terminar, contando cerrar con calma. */
  presupuestoMs: number;
  senal: AbortSignal;
  deps: DepsProceso;
};

export type ResultadoManejador = void | { resultado?: Record<string, unknown> } | { continuar: true };
export type Manejador = (c: ContextoTarea) => Promise<ResultadoManejador>;

export class ErrorTarea extends Error {
  readonly reintentable: boolean;
  constructor(mensaje: string, opciones: { reintentable: boolean }) {
    super(mensaje);
    this.name = "ErrorTarea";
    this.reintentable = opciones.reintentable;
  }
}

/** Lo que lance un manejador, como el `ErrorTarea` que entiende el trabajador. */
export function aErrorTarea(e: unknown): ErrorTarea {
  if (e instanceof ErrorTarea) return e;
  if (e instanceof ErrorAudio) return new ErrorTarea(e.message, { reintentable: e.tipo === "transitorio" });
  if (e instanceof ErrorTranscripcion) return new ErrorTarea(e.message, { reintentable: e.reintentable });
  if (e instanceof ErrorIA) return new ErrorTarea(e.message, { reintentable: e.reintentable });
  if (e instanceof ErrorAlmacen) {
    if (e.tipo === "no_encontrado") {
      return new ErrorTarea("No pudimos leer este archivo: ya no está en el almacenamiento. Vuelve a subirlo.", { reintentable: false });
    }
    return new ErrorTarea(e.message, { reintentable: e.tipo === "transitorio" });
  }
  return new ErrorTarea(e instanceof Error ? e.message : String(e), { reintentable: true });
}
