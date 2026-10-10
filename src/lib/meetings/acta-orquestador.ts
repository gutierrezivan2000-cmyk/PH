/**
 * El orquestador del acta decide qué sigue en una acta en curso. Cada acta es una `Generation` con `meetingId`; sus tareas
 * (`acta-tareas.ts`) viven en la misma cola que el procesamiento de la reunión, con claves que llevan el identificador de la
 * acta (`acta:<generación>:calentar | s<k> | final`): puede haber varias actas de una misma reunión y ninguna pisa a otra.
 *
 *  - `iniciarActa`: crea la `Generation`, parte la reunión en secciones y encola el calentamiento de la caché (el plan de
 *    secciones viaja en su payload: así el acta se redacta con el plan con que empezó, aunque la ficha cambie después).
 *  - `planificarSiguientesDeActa` (PURA): con el estado de las tareas, qué encolar y cuánto va. Las secciones esperan a que la
 *    caché esté calentada; si no se pudo calentar, se redacta UNA primero (la escribe) y las demás la leen.
 *  - `avanzarActa`: la que llama el trabajador al terminar cada tarea del acta: encola lo que sigue y anota el avance. Si el
 *    acta se quedó sin su primer paso (el proceso se cortó entre crearla y encolarlo), lo encola de nuevo.
 *  - `reanudarActa`: «Intentar de nuevo»: lo que ya se hizo se conserva (cada sección hecha ya se pagó) y solo se repite lo que falló.
 */
import { db } from "@/lib/db";
import { leerPlanDeSecciones, partesEnZona, planificarSecciones, type SeccionDeActa } from "./acta";
import { FUTURO_LEJANO, encolar } from "./cola";
import { cargarContextoDeReunion, type ContextoDeReunion } from "./contexto-reunion";
import {
  KIND_ACTA_CALENTAR, KIND_ACTA_FINAL, KIND_ACTA_SECCION, claveActaCalentar, claveActaFinal, claveActaSeccion, prefijoDeActa,
} from "./transcripcion/claves";

const EN_CURSO = ["pending", "processing"];

/**
 * Cuántas actas se redactan de una misma reunión: 3. Lo normal es una, o dos si se pide otra con otro enfoque. Cada una de una
 * reunión larga lee la transcripción completa y puede costar ≈ US$0,4; sin tope, 15 actas de la misma reunión eran ≈ US$6 que el
 * cupo de generaciones del plan no distingue de 15 informes de texto de US$0,01. El acta ya escrita se corrige con «Corregir documento».
 */
export const MAX_ACTAS_POR_REUNION = 3;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** ¿La tarea de calentar dejó la caché escrita? (`false` solo si se sabe que no la dejó.) */
export const cacheCalentada = (resultado: unknown): boolean => !(esObjeto(resultado) && resultado.calentada === false);

/* ════════════════════════════════════════════════════════════════════
   El plan (puro)
   ════════════════════════════════════════════════════════════════════ */

export type TareaDeActa = { kind: string; key: string; status: string };
export type TareaDeActaPorEncolar = { kind: string; key: string; payload: Record<string, unknown> };

export type PlanDeActa = {
  encolar: TareaDeActaPorEncolar[];
  /** 0-100. El calentamiento vale 5 %, las secciones 85 % y armar el acta el 10 % final. */
  progreso: number;
};

const entre0y100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function planificarSiguientesDeActa(e: {
  generationId: string;
  secciones: readonly SeccionDeActa[];
  tareas: readonly TareaDeActa[];
  /** `false`: la caché no se pudo escribir, así que la primera sección la escribe y las demás esperan a que termine. */
  calentada: boolean;
}): PlanDeActa {
  const id = e.generationId;
  const estado = new Map(e.tareas.map((t) => [t.key, t.status]));
  const total = e.secciones.length;
  const porEncolar: TareaDeActaPorEncolar[] = [];

  const calentarHecha = estado.get(claveActaCalentar(id)) === "hecha";
  const hechas = e.secciones.filter((s) => estado.get(claveActaSeccion(id, s.k)) === "hecha").length;

  if (calentarHecha) {
    // Con la caché escrita, todas a la vez (leen lo mismo). Sin ella, la primera sola: la escribe y las demás la leen.
    const primeraHecha = total > 0 && estado.get(claveActaSeccion(id, e.secciones[0].k)) === "hecha";
    const todasYa = e.calentada || primeraHecha;
    e.secciones.forEach((s, i) => {
      const clave = claveActaSeccion(id, s.k);
      if ((i === 0 || todasYa) && !estado.has(clave)) {
        porEncolar.push({ kind: KIND_ACTA_SECCION, key: clave, payload: { generationId: id, total, titulo: s.titulo, seccion: s } });
      }
    });
  }

  if (total > 0 && hechas === total && !estado.has(claveActaFinal(id))) {
    porEncolar.push({ kind: KIND_ACTA_FINAL, key: claveActaFinal(id), payload: { generationId: id, total } });
  }

  const finalHecha = estado.get(claveActaFinal(id)) === "hecha";
  const progreso = entre0y100((calentarHecha ? 5 : 0) + (total > 0 ? (85 * hechas) / total : 0) + (finalHecha ? 10 : 0));
  return { encolar: porEncolar, progreso };
}

/* ════════════════════════════════════════════════════════════════════
   Empezar
   ════════════════════════════════════════════════════════════════════ */

export type ResultadoDeIniciarActa =
  | { ok: true; generationId: string; /** Ya había una en curso: no se crea otra. */ yaEnCurso: boolean }
  | { ok: false; codigo: "no_existe" | "no_lista" | "sin_transcripcion" | "sin_cupo"; error: string };

/** Los cupos del plan: quien llama dice si esta persona puede gastar otra generación (y, si no, por qué). */
export type ComprobarCupo = () => Promise<{ permitido: boolean; mensaje?: string }>;

/**
 * Encola el primer paso de un acta: calentar la caché. El plan de secciones viaja en su payload, así el acta se redacta con el
 * plan con que empezó aunque la ficha cambie después.
 */
async function encolarCalentamiento(meetingId: string, generationId: string, contexto: Pick<ContextoDeReunion, "ficha" | "duracionMs">): Promise<TareaDeActaPorEncolar> {
  const tarea = {
    kind: KIND_ACTA_CALENTAR,
    key: claveActaCalentar(generationId),
    payload: { generationId, secciones: planificarSecciones(contexto.ficha, contexto.duracionMs) },
  };
  await encolar(meetingId, tarea.kind, tarea.key, tarea.payload);
  return tarea;
}

/** La acta en curso (o pendiente) de una reunión, la más antigua si hubiera más de una. */
async function actaEnCursoDe(meetingId: string): Promise<string | null> {
  const primeras = await db.generation.findMany({
    where: { meetingId, type: "acta", status: { in: EN_CURSO } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 1,
    select: { id: true },
  });
  return primeras[0]?.id ?? null;
}

/**
 * Pide el acta de una reunión: crea su `Generation` y encola el primer paso. Si ya hay una en curso devuelve esa (un doble clic
 * no gasta dos actas). Quien llama revisa antes los cupos del plan y, después, empuja el trabajador.
 */
export async function iniciarActa({
  meetingId, userId, comprobarCupo,
}: { meetingId: string; userId: string; comprobarCupo?: ComprobarCupo }): Promise<ResultadoDeIniciarActa> {
  const contexto = await cargarContextoDeReunion(meetingId, { userId });
  if (!contexto) return { ok: false, codigo: "no_existe", error: "Reunión no encontrada" };
  if (contexto.status !== "lista") return { ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." };
  if (contexto.lineas.length === 0) {
    return { ok: false, codigo: "sin_transcripcion", error: "Esta reunión no tiene transcripción: no hay de dónde redactar el acta." };
  }

  const enCurso = await actaEnCursoDe(meetingId);
  if (enCurso) {
    // Si un corte la dejó sin su primer paso, volver a pedirla la rescata en vez de dejarla esperando a que el cron lo note.
    await avanzarActa(meetingId, enCurso).catch((e) => console.error("[meetings/acta-orquestador] no se pudo avanzar el acta", enCurso, e));
    return { ok: true, generationId: enCurso, yaEnCurso: true };
  }

  // Tope de actas por reunión (las ya escritas y las en curso; las que fallaron no cuentan).
  const previas = await db.generation.count({ where: { meetingId, type: "acta", status: { in: [...EN_CURSO, "completed"] } } });
  if (previas >= MAX_ACTAS_POR_REUNION) {
    return {
      ok: false,
      codigo: "sin_cupo",
      error: `Esta reunión ya tiene ${MAX_ACTAS_POR_REUNION} actas. Descarga la que mejor quedó y ajústala con «Corregir documento».`,
    };
  }

  // El cupo se mira solo cuando se va a gastar una generación nueva (pedir otra vez la que ya está en curso no gasta nada).
  const cupo = comprobarCupo ? await comprobarCupo() : null;
  if (cupo && !cupo.permitido) return { ok: false, codigo: "sin_cupo", error: cupo.mensaje ?? "Llegaste al límite de generaciones de tu plan." };

  const fecha = partesEnZona(contexto.fecha);
  const g = await db.generation.create({
    data: {
      userId, propertyId: contexto.propertyId, type: "acta", status: "processing", progress: 0, month: fecha.mes, year: fecha.anio, meetingId, inputFiles: [],
      inputText: `Desde la reunión «${contexto.titulo}»`,
    },
  });

  // Dos clics casi a la vez pudieron crear dos: se queda la más antigua y la otra se borra.
  const primera = await actaEnCursoDe(meetingId);
  if (primera && primera !== g.id) {
    await db.generation.delete({ where: { id: g.id } }).catch(() => {});
    return { ok: true, generationId: primera, yaEnCurso: true };
  }

  await encolarCalentamiento(meetingId, g.id, contexto);
  return { ok: true, generationId: g.id, yaEnCurso: false };
}

/* ════════════════════════════════════════════════════════════════════
   Avanzar
   ════════════════════════════════════════════════════════════════════ */

/**
 * Mira las tareas de un acta en curso, encola lo que sigue y anota el avance. Es seguro llamarla de más y a la vez desde varias
 * tareas: encolar es idempotente por clave y el avance solo sube.
 */
export async function avanzarActa(meetingId: string, generationId: string): Promise<PlanDeActa | null> {
  const g = await db.generation.findFirst({ where: { id: generationId, meetingId }, select: { id: true, userId: true, status: true, progress: true } });
  if (!g || !EN_CURSO.includes(g.status)) return null;

  const tareas = await db.meetingTask.findMany({
    where: { meetingId, key: { startsWith: prefijoDeActa(generationId) } },
    select: { kind: true, key: true, status: true, payload: true, result: true },
  });
  const calentar = tareas.find((t) => t.kind === KIND_ACTA_CALENTAR);
  if (!calentar) {
    // Se creó el acta y el proceso se cortó antes de encolar su primer paso: sin él nada la haría avanzar nunca (y «Intentar de
    // nuevo» tampoco, porque no habría qué reintentar). Se encola ahora, con el plan de siempre. Encolar es idempotente por clave.
    const contexto = await cargarContextoDeReunion(meetingId, { userId: g.userId });
    if (contexto) return { encolar: [await encolarCalentamiento(meetingId, generationId, contexto)], progreso: 0 };
  }
  const secciones = leerPlanDeSecciones(esObjeto(calentar?.payload) ? calentar.payload.secciones : null);
  if (secciones.length === 0) {
    // Sin plan no hay cómo seguir (no debería pasar: lo escribe `iniciarActa`). Mejor decirlo que quedarse esperando.
    await db.generation.updateMany({
      where: { id: generationId, status: { in: EN_CURSO } },
      data: { status: "failed", progress: 0, errorMessage: "No pudimos leer el plan del acta. Inténtalo de nuevo." },
    });
    return null;
  }

  const plan = planificarSiguientesDeActa({ generationId, secciones, tareas, calentada: cacheCalentada(calentar?.result) });
  for (const t of plan.encolar) await encolar(meetingId, t.kind, t.key, t.payload);
  if (plan.progreso > g.progress) {
    await db.generation.updateMany({ where: { id: generationId, status: { in: EN_CURSO }, progress: { lt: plan.progreso } }, data: { progress: plan.progreso } });
  }
  return plan;
}

/** Las actas en curso: las que el cron revisa por si el trabajador murió justo entre terminar una tarea y encolar la siguiente. */
export async function avanzarActasEnCurso(limite = 25): Promise<number> {
  const actas = await db.generation.findMany({
    where: { type: "acta", meetingId: { not: null }, status: { in: EN_CURSO } },
    orderBy: { createdAt: "asc" },
    take: limite,
    select: { id: true, meetingId: true },
  });
  let n = 0;
  for (const a of actas) {
    if (!a.meetingId) continue;
    try {
      if (await avanzarActa(a.meetingId, a.id)) n++;
    } catch (e) {
      console.error("[meetings/acta-orquestador] no se pudo avanzar el acta", a.id, e);
    }
  }
  return n;
}

/* ════════════════════════════════════════════════════════════════════
   Reanudar
   ════════════════════════════════════════════════════════════════════ */

/**
 * «Intentar de nuevo»: lo que falló vuelve a empezar de cero y lo que quedó congelado se descongela; lo que ya estaba hecho se
 * conserva (cada sección hecha ya se pagó). Solo si el acta está en error.
 */
export async function reanudarActa(
  meetingId: string, generationId: string, ahora: Date = new Date(), comprobarCupo?: ComprobarCupo,
): Promise<{ ok: true } | { ok: false; codigo: "no_en_error" | "sin_cupo"; error: string }> {
  const g = await db.generation.findFirst({ where: { id: generationId, meetingId, type: "acta", status: "failed" }, select: { id: true } });
  if (!g) return { ok: false, codigo: "no_en_error", error: "Esta acta no está en error." };
  // Un acta con error no cuenta para el cupo; al retomarla vuelve a contar.
  const cupo = comprobarCupo ? await comprobarCupo() : null;
  if (cupo && !cupo.permitido) return { ok: false, codigo: "sin_cupo", error: cupo.mensaje ?? "Llegaste al límite de generaciones de tu plan." };
  const prefijo = prefijoDeActa(generationId);
  await db.meetingTask.updateMany({ where: { meetingId, status: "fallida", key: { startsWith: prefijo } }, data: { status: "pendiente", attempts: 0, runAfter: ahora, lockedAt: null, error: null } });
  await db.meetingTask.updateMany({ where: { meetingId, status: "pendiente", runAfter: FUTURO_LEJANO, key: { startsWith: prefijo } }, data: { runAfter: ahora } });
  const r = await db.generation.updateMany({ where: { id: generationId, status: "failed" }, data: { status: "processing", errorMessage: null } });
  // Dos clics casi a la vez: solo el primero la retoma.
  if (r.count !== 1) return { ok: false, codigo: "no_en_error", error: "Esta acta no está en error." };
  // Si lo que falló fue el último paso y no quedó nada por hacer, esto encola lo que falte.
  await avanzarActa(meetingId, generationId);
  return { ok: true };
}
