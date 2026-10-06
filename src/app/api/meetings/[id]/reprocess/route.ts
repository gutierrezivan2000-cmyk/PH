export const runtime = "nodejs";
// El trabajo que se empuja con after() corre dentro de este límite.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible } from "@/lib/meetings/acceso";
import { demoReprocesar } from "@/lib/meetings/demo";
import { empujar } from "@/lib/meetings/empujon";
import { reprocesarSinCupo } from "@/lib/meetings/sin-cupo";

type Contexto = { params: Promise<{ id: string }> };

/** El código HTTP de cada motivo por el que no se puede procesar de nuevo. */
const CODIGOS = { no_existe: 404, no_esta_en_espera: 409, sin_cupo: 429 } as const;

/**
 * POST /api/meetings/[id]/reprocess → { status: "en_cola" }
 *
 * «Procesar de nuevo» una reunión que quedó en «sin_cupo»: se vuelve a mirar el cupo del plan y, si ahora alcanza, sigue
 * procesándose desde el audio que se conservó (sin volver a subirlo). 429 con el motivo si todavía no alcanza; 409 si la
 * reunión no está esperando horas. Idempotente: si ya se está procesando o ya está lista, devuelve su estado sin tocar nada.
 */
export async function POST(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const r = demoReprocesar(ctx.userId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: CODIGOS[r.codigo] });
    return NextResponse.json(r.valor);
  }

  try {
    await ensureMeetingsSchema();
    const r = await reprocesarSinCupo({ meetingId: id, userId: ctx.userId });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: CODIGOS[r.codigo] });
    if (r.status === "en_cola") empujar(); // sin esperar al cron: el trabajo arranca cuando ya se respondió
    return NextResponse.json({ status: r.status });
  } catch (error) {
    console.error("[api/meetings/[id]/reprocess]", error);
    return NextResponse.json({ error: "No pudimos procesar la reunión de nuevo. Inténtalo de nuevo." }, { status: 500 });
  }
}
