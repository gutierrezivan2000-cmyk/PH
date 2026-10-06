/**
 * «Generar el resumen otra vez».
 *
 * Cuando la IA no pudo (no estaba disponible, se acabó el saldo, un fallo del servicio), la transcripción quedó completa y
 * la reunión «lista», pero sin resumen o con fragmentos sin analizar. Volver a pedirlo NO repite todo el análisis —que es lo
 * que cuesta—: solo se rehacen los fragmentos que se omitieron y la ficha que los junta. Lo que la IA ya había extraído de
 * los demás se conserva.
 *
 * Solo se puede cuando algo falló: con el resumen completo no hay nada que rehacer, y gastar otra vez el análisis de 8 horas
 * de audio para obtener casi lo mismo no es lo que se quiere.
 */
import { db } from "@/lib/db";
import { avanzar } from "./orquestador";
import { estadoDelResumen, sePuedeReintentarElResumen } from "./resumen-pantalla";
import { CLAVE_FICHA, KIND_BLOQUE } from "./transcripcion/claves";

export type ResultadoDeReanalisis =
  | { ok: true; /** Cuántos fragmentos se vuelven a analizar (0: solo falta la ficha). */ fragmentos: number }
  | { ok: false; codigo: "no_lista" | "no_hace_falta" | "sin_bloques"; error: string };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Un fragmento que no se analizó: su resultado no trae lo extraído (se omitió, o el resultado no se puede leer). */
export const fragmentoSinAnalizar = (resultado: unknown): boolean => !(esObjeto(resultado) && esObjeto(resultado.bloque));

export async function reanalizarResumen(meetingId: string): Promise<ResultadoDeReanalisis> {
  const reunion = await db.meeting.findFirst({ where: { id: meetingId }, select: { status: true, errorMessage: true, digest: true } });
  if (!reunion || reunion.status !== "lista") {
    return { ok: false, codigo: "no_lista", error: "Esta reunión todavía se está procesando." };
  }

  const ficha = esObjeto(reunion.digest) && typeof reunion.digest.resumen === "string"
    ? { resumen: reunion.digest.resumen, fragmentosOmitidos: typeof reunion.digest.fragmentosOmitidos === "number" ? reunion.digest.fragmentosOmitidos : 0 }
    : null;
  const estado = estadoDelResumen(reunion, ficha);
  if (!sePuedeReintentarElResumen(estado)) {
    return {
      ok: false,
      codigo: "no_hace_falta",
      error: estado === "completo" ? "Esta reunión ya tiene su resumen." : "No hay nada que resumir en esta reunión.",
    };
  }

  const bloques = await db.meetingTask.findMany({ where: { meetingId, kind: KIND_BLOQUE }, select: { key: true, status: true, result: true } });
  if (bloques.length === 0) return { ok: false, codigo: "sin_bloques", error: "Esta reunión no tiene fragmentos para analizar." };

  // Primero las tareas (todo esto se puede repetir sin daño) y al final se cambia el estado: si algo se corta en el medio,
  // la reunión sigue «lista» y volver a pulsar el botón retoma desde aquí.
  const rehacer = bloques.filter((b) => b.status === "hecha" && fragmentoSinAnalizar(b.result)).map((b) => b.key);
  if (rehacer.length > 0) {
    await db.meetingTask.updateMany({
      where: { meetingId, kind: KIND_BLOQUE, key: { in: rehacer } },
      data: { status: "pendiente", attempts: 0, runAfter: new Date(), lockedAt: null, error: null },
    });
  }
  // Sin la tarea `ficha`, el orquestador la vuelve a encolar cuando todos los fragmentos estén hechos.
  await db.meetingTask.deleteMany({ where: { meetingId, key: CLAVE_FICHA } });

  // Solo si sigue «lista»: dos clics seguidos no la reinician dos veces.
  const r = await db.meeting.updateMany({
    where: { id: meetingId, status: "lista" },
    data: { status: "procesando", stage: "analizando", progress: 0, errorMessage: null },
  });
  if (r.count === 1) await avanzar(meetingId);
  return { ok: true, fragmentos: rehacer.length };
}
