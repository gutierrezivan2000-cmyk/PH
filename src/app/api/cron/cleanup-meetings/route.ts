export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { almacenBlob } from "@/lib/meetings/almacen-blob";
import { limpiarReuniones } from "@/lib/meetings/retencion";

/**
 * GET /api/cron/cleanup-meetings: el cron de Vercel lo llama una vez al día (`17 4 * * *`, solo en producción) con
 * `Authorization: Bearer <CRON_SECRET>`. Aplica la retención de Reuniones: borra los originales a los 90 días y las partes en vivo
 * de las sesiones ya ensambladas (ver `retencion.ts`); el audio normalizado y la transcripción se conservan. Cada pasada tiene su
 * tope: si queda trabajo lo dice (`pendiente`) y la siguiente sigue. Es seguro que se solape o se repita.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    await ensureMeetingsSchema();
    const resumen = await limpiarReuniones({ almacen: almacenBlob(), presupuestoMs: 240_000 });
    console.info("[cron/cleanup-meetings]", JSON.stringify(resumen));
    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    console.error("[cron/cleanup-meetings]", error);
    return NextResponse.json({ error: "No pudimos limpiar los archivos de las reuniones." }, { status: 500 });
  }
}
