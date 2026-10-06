/**
 * Lo que se le cuenta a la interfaz de un acta: su estado, el avance, lo pendiente de verificar, los requisitos legales y dónde
 * abrir el documento. `aActaDTO` es PURA (se prueba sin base de datos); `leerActa` la alimenta con la `Generation` y las tareas.
 */
import { db } from "@/lib/db";
import { leerPlanDeSecciones } from "./acta";
import { leerTodo, type Almacen } from "./almacen";
import type { ActaDTO, EstadoActa, RequisitoActaDTO, RespuestaActa } from "./dto";
import { KIND_ACTA_CALENTAR, KIND_ACTA_SECCION, prefijoDeActa } from "./transcripcion/claves";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** El estado de la `Generation` (processing, pending, completed, failed) como lo ve la persona. */
export const estadoDeActa = (status: string): EstadoActa => (status === "completed" ? "lista" : status === "failed" ? "error" : "procesando");

export type FilaDeActa = {
  id: string;
  status: string;
  progress: number;
  createdAt: Date;
  completedAt: Date | null;
  errorMessage: string | null;
  outputFiles: unknown;
};

/** Un JSON guardado como texto en `outputFiles` (todos sus valores son texto), leído con tolerancia. */
function jsonDeSalida(salida: Record<string, unknown>, clave: string): unknown {
  const v = salida[clave];
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export function leerRequisitos(json: unknown): RequisitoActaDTO[] | null {
  if (!Array.isArray(json)) return null;
  const items = json.flatMap((r): RequisitoActaDTO[] =>
    esObjeto(r) && typeof r.item === "string" && r.item.trim() && (r.status === "completo" || r.status === "pendiente")
      ? [{ item: r.item.trim(), status: r.status, detail: typeof r.detail === "string" ? r.detail.trim() : "" }]
      : [],
  );
  return items.length > 0 ? items : null;
}

export function leerPendientes(json: unknown): string[] {
  return Array.isArray(json) ? json.filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
}

export const urlDeDescarga = (generationId: string, tipo: "acta" | "acta-markdown"): string => `/api/download/${generationId}/${tipo}`;

export function aActaDTO(fila: FilaDeActa, secciones: { hechas: number; total: number } | null = null): ActaDTO {
  const estado = estadoDeActa(fila.status);
  const salida = esObjeto(fila.outputFiles) ? fila.outputFiles : {};
  const lista = estado === "lista";
  const progreso = lista ? 100 : Math.max(0, Math.min(100, Math.round(fila.progress)));

  let etapa: ActaDTO["etapa"] = null;
  if (estado === "procesando") {
    if (progreso < 5) etapa = "preparando";
    else etapa = secciones && secciones.total > 0 && secciones.hechas >= secciones.total ? "armando" : "redactando";
  }

  return {
    id: fila.id,
    estado,
    progreso,
    etapa,
    secciones: estado === "procesando" ? secciones : null,
    creadaEn: fila.createdAt.toISOString(),
    terminadaEn: lista && fila.completedAt ? fila.completedAt.toISOString() : null,
    error: estado === "error" ? fila.errorMessage || "No pudimos redactar el acta." : null,
    pendientes: lista ? leerPendientes(jsonDeSalida(salida, "actaPendientes")) : [],
    requisitos: lista ? leerRequisitos(jsonDeSalida(salida, "actaRequirements")) : null,
    archivos: lista && typeof salida.actaHtml === "string" ? { html: urlDeDescarga(fila.id, "acta"), markdown: urlDeDescarga(fila.id, "acta-markdown") } : null,
  };
}

/** Cuántas secciones lleva un acta en curso, de las tareas de su cola. */
async function seccionesDeActa(meetingId: string, generationId: string): Promise<{ hechas: number; total: number } | null> {
  const tareas = await db.meetingTask.findMany({
    where: { meetingId, key: { startsWith: prefijoDeActa(generationId) } },
    select: { kind: true, status: true, payload: true },
  });
  const calentar = tareas.find((t) => t.kind === KIND_ACTA_CALENTAR);
  const total = leerPlanDeSecciones(esObjeto(calentar?.payload) ? calentar.payload.secciones : null).length;
  if (total === 0) return null;
  return { hechas: tareas.filter((t) => t.kind === KIND_ACTA_SECCION && t.status === "hecha").length, total };
}

const SELECCION = { id: true, status: true, progress: true, createdAt: true, completedAt: true, errorMessage: true, outputFiles: true } as const;

/** La acta más reciente de la reunión. `almacen` solo hace falta con `conTexto`. */
export async function leerActa(meetingId: string, opciones: { conTexto?: boolean; almacen?: Almacen } = {}): Promise<RespuestaActa> {
  const fila = await db.generation.findFirst({ where: { meetingId, type: "acta" }, orderBy: { createdAt: "desc" }, select: SELECCION });
  if (!fila) return { acta: null, texto: null };
  const estado = estadoDeActa(fila.status);
  const secciones = estado === "procesando" ? await seccionesDeActa(meetingId, fila.id) : null;
  const acta = aActaDTO(fila, secciones);

  let texto: string | null = null;
  const salida = esObjeto(fila.outputFiles) ? fila.outputFiles : {};
  if (opciones.conTexto && estado === "lista" && opciones.almacen && typeof salida.actaReferencias === "string") {
    try {
      texto = new TextDecoder().decode(await leerTodo(opciones.almacen, salida.actaReferencias));
    } catch (e) {
      console.error("[meetings/acta-estado] no se pudo leer el texto del acta", fila.id, e instanceof Error ? e.message : e);
    }
  }
  return { acta, texto };
}
