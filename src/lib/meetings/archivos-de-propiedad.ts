/**
 * Al borrar una copropiedad la base de datos borra sus reuniones en cascada, pero los archivos de cada reunión (audio, originales,
 * transcripción) viven en Blob y no se van solos: sin esto quedarían guardados para siempre, sin nadie que pueda verlos ni
 * borrarlos. Se borran ANTES que las filas (después ya no habría cómo saber cuáles eran), igual que al borrar una reunión.
 */
import { db } from "@/lib/db";
import { borrarArchivosDeReunion } from "./almacen";

/** Un error de «la tabla no existe» (todavía nadie ha usado Reuniones): no hay reuniones, así que no hay archivos. */
const tablaInexistente = (e: unknown): boolean => /P2021|42P01|does not exist/i.test(e instanceof Error ? e.message : String(e));

/**
 * Borra los archivos de todas las reuniones de la copropiedad que son de esa persona y devuelve cuántas reuniones eran. Si algo
 * falla se detiene y lanza: quien llama NO debe borrar la copropiedad (los archivos que quedaran serían irrecuperables).
 */
export async function borrarArchivosDeLasReunionesDe(
  propertyId: string,
  userId: string,
  borrar: (meetingId: string) => Promise<unknown> = borrarArchivosDeReunion,
): Promise<number> {
  let reuniones: Array<{ id: string }>;
  try {
    reuniones = await db.meeting.findMany({ where: { propertyId, userId }, select: { id: true } });
  } catch (e) {
    if (tablaInexistente(e)) return 0;
    throw e;
  }
  for (const r of reuniones) await borrar(r.id);
  return reuniones.length;
}
