/**
 * Arranque del procesamiento de una reunión.
 *
 * Hoy solo la deja «en cola». El hito de la cola (M4) completa esto: encola la
 * primera tarea (ensamblar sesiones / normalizar el audio de cada fuente) y
 * empuja al trabajador. Las rutas ya llaman a esta función, así que no cambia
 * nada de su lado.
 */
import { db } from "@/lib/db";

export async function iniciarProcesamiento(meetingId: string): Promise<void> {
  await db.meeting.update({
    where: { id: meetingId },
    data: { status: "en_cola", stage: null, progress: 0, errorMessage: null },
  });
}
