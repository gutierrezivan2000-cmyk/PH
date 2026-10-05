/**
 * El trabajador: reclama tareas de la cola y las ejecuta, varias a la vez, mientras quede tiempo. Lo llama el cron
 * cada minuto (producción) y las rutas con `after()` (todos los entornos). Es seguro que corran varios a la vez:
 * cada tarea se reclama de forma atómica.
 */
import { db } from "@/lib/db";
import { avanzarActa } from "./acta-orquestador";
import { almacenBlob } from "./almacen-blob";
import { completar, continuar, devolver, fallar, latido, reclamar, type TareaReclamada } from "./cola";
import { MANEJADORES, aErrorTarea, type DepsProceso, type Manejador } from "./manejadores";
import { avanzar } from "./orquestador";
import { PRESUPUESTO_TAREA_MS } from "./tipos";
import { generacionDeClaveDeActa } from "./transcripcion/claves";

/** No se reclaman tareas nuevas si queda menos de lo que dura la más larga. */
const MARGEN_MINIMO_MS = 120_000;
/** Cada cuánto una tarea larga avisa que sigue viva. */
const LATIDO_MS = 30_000;

export type OpcionesTrabajar = {
  /** Cuánto tiempo (ms) tiene en total esta invocación (la ruta tiene `maxDuration = 300` s). */
  presupuestoMs: number;
  concurrencia?: number;
  /** Para pruebas. */
  margenMinimoMs?: number;
  manejadores?: Record<string, Manejador>;
  deps?: Partial<DepsProceso>;
  reloj?: () => number;
};

export type ResumenDeTrabajo = { ejecutadas: number; fallidas: number; continuadas: number };

export async function trabajar(o: OpcionesTrabajar): Promise<ResumenDeTrabajo> {
  const reloj = o.reloj ?? Date.now;
  const fin = reloj() + o.presupuestoMs;
  const concurrencia = o.concurrencia ?? 4;
  const margen = o.margenMinimoMs ?? MARGEN_MINIMO_MS;
  const manejadores = o.manejadores ?? MANEJADORES;
  const deps: DepsProceso = { almacen: almacenBlob(), ahora: () => new Date(reloj()), ...o.deps };
  const resumen: ResumenDeTrabajo = { ejecutadas: 0, fallidas: 0, continuadas: 0 };
  const enCurso = new Set<Promise<void>>();

  async function ejecutar(t: TareaReclamada): Promise<void> {
    const manejador = manejadores[t.kind];
    const ahora = () => new Date(reloj());
    const reunion = await db.meeting.findFirst({ where: { id: t.meetingId }, select: { id: true, status: true } });
    // Una reunión eliminada se lleva sus tareas; una en error las deja quietas hasta «Reintentar».
    if (!reunion) return completar(t.id);
    if (reunion.status === "error") return devolver(t.id);
    if (reunion.status === "en_cola") {
      await db.meeting.updateMany({ where: { id: t.meetingId, status: "en_cola" }, data: { status: "procesando", stage: "preparando_audio" } });
    }

    const control = new AbortController();
    const pulso = setInterval(() => void latido(t.id, ahora()).catch(() => {}), LATIDO_MS);
    let veredicto: "ok" | "fallo" | "continuar" = "ok";
    try {
      const r = await manejador({
        tarea: t,
        presupuestoMs: Math.max(5_000, Math.min(PRESUPUESTO_TAREA_MS, fin - reloj())),
        senal: control.signal,
        deps,
      });
      if (r && "continuar" in r) {
        await continuar(t.id, ahora());
        veredicto = "continuar";
      } else {
        await completar(t.id, r?.resultado);
      }
    } catch (e) {
      const et = aErrorTarea(e);
      console.error(`[meetings/trabajador] ${t.kind} (${t.key}) falló: ${et.message}`);
      await fallar(t.id, et.message, { reintentable: et.reintentable }, ahora());
      veredicto = "fallo";
    } finally {
      clearInterval(pulso);
    }
    if (veredicto === "fallo") resumen.fallidas++;
    else if (veredicto === "continuar") resumen.continuadas++;
    resumen.ejecutadas++;
    try {
      // Las tareas del acta avanzan su acta; las demás, la reunión (la reunión puede estar «lista» y el acta, en curso).
      const acta = generacionDeClaveDeActa(t.key);
      if (acta) await avanzarActa(t.meetingId, acta);
      else await avanzar(t.meetingId);
    } catch (e) {
      console.error("[meetings/trabajador] no se pudo avanzar", t.meetingId, e);
    }
  }

  for (;;) {
    if (reloj() + margen <= fin && enCurso.size < concurrencia) {
      const tareas = await reclamar(concurrencia - enCurso.size, Object.keys(manejadores), new Date(reloj()));
      for (const t of tareas) {
        const p: Promise<void> = ejecutar(t)
          .catch((e) => console.error("[meetings/trabajador] error inesperado", t.kind, e))
          .finally(() => enCurso.delete(p));
        enCurso.add(p);
      }
    }
    if (enCurso.size === 0) break;
    await Promise.race(enCurso);
  }
  return resumen;
}
