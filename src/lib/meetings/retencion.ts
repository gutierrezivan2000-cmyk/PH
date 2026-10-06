/**
 * La retención de Reuniones (PLAN §12): lo que ya no hace falta se borra solo; lo que sí —el audio normalizado, `audio.mp3` y la
 * transcripción— se conserva. La corre el cron diario (`/api/cron/cleanup-meetings`).
 *
 *  - **Originales.** El archivo que se subió y la sesión que se ensambló de lo grabado se borran a los `RETENCION_ORIGINAL_DIAS`
 *    (90) días, SOLO si la reunión ya tiene su `audio.mp3` y no está en marcha: de ahí sale todo lo demás (transcribir de nuevo,
 *    «Reintentar», «Procesar de nuevo»). La fila se queda, marcada con `originalDeletedAt`.
 *  - **Partes en vivo.** Las partes de una sesión de la grabadora ya están en la sesión ensamblada y comprobada (`normalizada`):
 *    sobran. Se borran a los `RETENCION_PARTES_DIAS` (2) días de ese momento —el margen es una red de seguridad por si el
 *    ensamblado salió mal—. Las partes de una grabación sin cerrar NO se tocan: son lo único que hay de ese audio.
 *
 * Es idempotente y por pasadas: cada una hace a lo sumo `limite` borrados y se detiene al acabarse el tiempo; la siguiente sigue
 * donde quedó. Nunca borra por una ruta que no sea del lugar que le toca (`meetings/<id>/fuentes/` o `meetings/<id>/vivo/`).
 */
import { db } from "@/lib/db";
import { ErrorAlmacen, prefijoDeReunion, type Almacen } from "./almacen";
import { RETENCION_ORIGINAL_DIAS } from "./tipos";

const DIA_MS = 86_400_000;
/** El plazo que ven las personas (`tipos.ts`): lo mismo, salvo que `RETENCION_ORIGINAL_DIAS` lo cambie en el servidor. */
export const RETENCION_ORIGINAL_DIAS_POR_DEFECTO = RETENCION_ORIGINAL_DIAS;
export const RETENCION_PARTES_DIAS_POR_DEFECTO = 2;

/** Los estados en que la reunión ya no necesita su original: el audio está armado y no hay nada en marcha. */
const ESTADOS_SIN_ORIGINAL = ["lista", "sin_cupo", "error"];
/** Cuántos candidatos se miran por vuelta. */
const TAM_LOTE = 200;
/** Las vueltas que se dan como mucho en una pasada (para no recorrer sin fin lo que no se puede borrar). */
const MAX_VUELTAS = 25;

export type DiasDeRetencion = { originalDias: number; partesDias: number };

/** Los plazos de `RETENCION_ORIGINAL_DIAS` y `RETENCION_PARTES_DIAS`; un valor que no es un número de días (≥ 1) usa el de siempre. */
export function diasDeRetencion(env: Record<string, string | undefined> = process.env): DiasDeRetencion {
  const leer = (valor: string | undefined, porDefecto: number): number => {
    const n = Number(valor?.trim());
    return valor?.trim() && Number.isFinite(n) && n >= 1 ? Math.floor(n) : porDefecto;
  };
  return {
    originalDias: leer(env.RETENCION_ORIGINAL_DIAS, RETENCION_ORIGINAL_DIAS_POR_DEFECTO),
    partesDias: leer(env.RETENCION_PARTES_DIAS, RETENCION_PARTES_DIAS_POR_DEFECTO),
  };
}

export type ResumenDeLimpieza = {
  /** Originales (archivos subidos y sesiones ensambladas) borrados. */
  originales: number;
  /** Sesiones de la grabadora cuyas partes en vivo se borraron, y cuántas partes eran. */
  sesiones: number;
  partes: number;
  bytesLiberados: number;
  /** Lo que no se tocó porque su ruta no era la que le toca (datos raros: se avisa en el registro). */
  omitidas: number;
  /** Lo que falló al borrar (el almacén no contestó…): se reintenta en la próxima pasada. */
  errores: number;
  /** Quedó trabajo: se llegó al tope de la pasada o se acabó el tiempo. */
  pendiente: boolean;
};

/**
 * La ruta de un archivo de Blob a partir de su URL, solo si cuelga de `prefijo` (`meetings/<id>/fuentes/`): así una fila con una
 * URL equivocada nunca borra lo de otra reunión ni lo de otro módulo. null si no es segura.
 */
export function rutaBorrable(url: string | null | undefined, prefijo: string): string | null {
  if (!url) return null;
  let ruta: string;
  try {
    ruta = decodeURIComponent(new URL(url).pathname).replace(/^\//, "");
  } catch {
    return null;
  }
  return ruta.startsWith(prefijo) && ruta.length > prefijo.length && !ruta.includes("..") ? ruta : null;
}

export async function limpiarReuniones({
  almacen, ahora = new Date(), dias = diasDeRetencion(), limite = 200, presupuestoMs = 240_000,
}: {
  almacen: Pick<Almacen, "borrar">;
  ahora?: Date;
  dias?: DiasDeRetencion;
  /** Cuántos originales y cuántas sesiones de partes se borran como mucho en esta pasada. */
  limite?: number;
  presupuestoMs?: number;
}): Promise<ResumenDeLimpieza> {
  const resumen: ResumenDeLimpieza = { originales: 0, sesiones: 0, partes: 0, bytesLiberados: 0, omitidas: 0, errores: 0, pendiente: false };
  const inicio = Date.now();
  const sinTiempo = () => Date.now() - inicio > presupuestoMs;
  await limpiarOriginales({ almacen, ahora, corte: new Date(ahora.getTime() - dias.originalDias * DIA_MS), limite, sinTiempo, resumen });
  await limpiarPartes({ almacen, corte: new Date(ahora.getTime() - dias.partesDias * DIA_MS), limite, sinTiempo, resumen });
  return resumen;
}

type Contexto = {
  almacen: Pick<Almacen, "borrar">;
  corte: Date;
  limite: number;
  sinTiempo: () => boolean;
  resumen: ResumenDeLimpieza;
};

/** Un borrado que el almacén dice que ya no existe es un borrado hecho. */
const yaNoEstaba = (e: unknown) => e instanceof ErrorAlmacen && e.tipo === "no_encontrado";

async function limpiarOriginales({ almacen, ahora, corte, limite, sinTiempo, resumen }: Contexto & { ahora: Date }): Promise<void> {
  // Los que se miraron y no tocaba borrar (su reunión sigue en marcha, o aún no tiene audio): no se vuelven a pedir en esta pasada,
  // para que no tapen a los que sí tocan.
  const vistas = new Set<string>();
  let borradas = 0;
  for (let vuelta = 0; ; vuelta++) {
    if (vuelta >= MAX_VUELTAS || sinTiempo()) {
      resumen.pendiente = true;
      return;
    }
    const lote = await db.meetingSource.findMany({
      where: { originalDeletedAt: null, url: { not: null }, createdAt: { lt: corte }, ...(vistas.size > 0 ? { NOT: { id: { in: [...vistas] } } } : {}) },
      orderBy: { createdAt: "asc" },
      take: TAM_LOTE,
      select: { id: true, meetingId: true, url: true, sizeBytes: true },
    });
    if (lote.length === 0) return;
    for (const f of lote) vistas.add(f.id);

    const tocan = new Set(
      (
        await db.meeting.findMany({
          where: { id: { in: [...new Set(lote.map((f) => f.meetingId))] }, audioUrl: { not: null }, status: { in: ESTADOS_SIN_ORIGINAL } },
          select: { id: true },
        })
      ).map((m) => m.id),
    );

    for (const f of lote) {
      if (!tocan.has(f.meetingId)) continue;
      if (borradas >= limite) {
        resumen.pendiente = true;
        return;
      }
      let prefijo: string;
      try {
        prefijo = `${prefijoDeReunion(f.meetingId)}fuentes/`;
      } catch {
        resumen.omitidas++;
        console.error("[meetings/retencion] identificador de reunión no válido; no se borra", f.id);
        continue;
      }
      if (!f.url || !rutaBorrable(f.url, prefijo)) {
        resumen.omitidas++;
        console.error("[meetings/retencion] la ruta del original no es de su reunión; no se borra", f.id);
        continue;
      }
      try {
        await almacen.borrar([f.url]).catch((e) => {
          if (!yaNoEstaba(e)) throw e;
        });
        await db.meetingSource.update({ where: { id: f.id }, data: { originalDeletedAt: ahora } });
        resumen.originales++;
        resumen.bytesLiberados += f.sizeBytes ?? 0;
        borradas++;
      } catch (e) {
        resumen.errores++;
        console.error("[meetings/retencion] no se pudo borrar el original", f.id, e);
      }
    }
  }
}

async function limpiarPartes({ almacen, corte, limite, sinTiempo, resumen }: Contexto): Promise<void> {
  // Las sesiones (reunión + número) que se miraron y no tocaba borrar: una grabación sin cerrar, o aún sin ensamblar.
  const vistas: Array<{ meetingId: string; session: number }> = [];
  let hechas = 0;
  for (let vuelta = 0; ; vuelta++) {
    if (vuelta >= MAX_VUELTAS || sinTiempo()) {
      resumen.pendiente = true;
      return;
    }
    const lote = await db.meetingLivePart.findMany({
      where: { seq: { gte: 0 }, createdAt: { lt: corte }, ...(vistas.length > 0 ? { NOT: { OR: vistas } } : {}) },
      distinct: ["meetingId", "session"],
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { meetingId: true, session: true },
    });
    if (lote.length === 0) return;

    for (const s of lote) {
      vistas.push({ meetingId: s.meetingId, session: s.session });
      if (hechas >= limite) {
        resumen.pendiente = true;
        return;
      }
      // La sesión ya está ensamblada y comprobada (normalizada) desde hace más de `corte`: sus partes sobran.
      const ensamblada = await db.meetingSource.findFirst({
        where: { meetingId: s.meetingId, kind: "grabacion", session: s.session, url: { not: null }, status: "normalizada", updatedAt: { lt: corte } },
        select: { id: true },
      });
      if (!ensamblada) continue;

      const partes = await db.meetingLivePart.findMany({
        where: { meetingId: s.meetingId, session: s.session, seq: { gte: 0 } },
        select: { id: true, url: true, bytes: true },
      });
      if (partes.length === 0) continue; // otra pasada ya las borró
      let prefijo: string;
      try {
        prefijo = `${prefijoDeReunion(s.meetingId)}vivo/`;
      } catch {
        resumen.omitidas++;
        console.error("[meetings/retencion] identificador de reunión no válido; no se borran sus partes", s.meetingId);
        continue;
      }
      if (partes.some((p) => !rutaBorrable(p.url, prefijo))) {
        resumen.omitidas++;
        console.error("[meetings/retencion] una parte no es de su reunión; no se borra la sesión", s.meetingId, s.session);
        continue;
      }
      try {
        await almacen.borrar(partes.map((p) => p.url)).catch((e) => {
          if (!yaNoEstaba(e)) throw e;
        });
        await db.meetingLivePart.deleteMany({ where: { id: { in: partes.map((p) => p.id) } } });
        resumen.sesiones++;
        resumen.partes += partes.length;
        resumen.bytesLiberados += partes.reduce((suma, p) => suma + (p.bytes ?? 0), 0);
        hechas++;
      } catch (e) {
        resumen.errores++;
        console.error("[meetings/retencion] no se pudieron borrar las partes de la sesión", s.meetingId, s.session, e);
      }
    }
  }
}
