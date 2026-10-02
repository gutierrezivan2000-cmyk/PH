/**
 * Arranque del procesamiento de una reunión: la deja «en cola» y encola la primera etapa (unir las sesiones de la
 * grabadora y normalizar cada fuente). Quien llama empuja después al trabajador (`empujar()`); si nadie lo hace, el
 * cron lo recoge en el siguiente minuto.
 */
import { db } from "@/lib/db";
import { avanzar } from "./orquestador";

export async function iniciarProcesamiento(meetingId: string): Promise<void> {
  await db.meeting.update({
    where: { id: meetingId },
    data: { status: "en_cola", stage: null, progress: 0, errorMessage: null },
  });
  await avanzar(meetingId);
}
