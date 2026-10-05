export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { avanzarActasEnCurso } from "@/lib/meetings/acta-orquestador";
import { vigilante } from "@/lib/meetings/cola";
import { trabajar } from "@/lib/meetings/trabajador";

/**
 * GET /api/cron/process-meetings: el cron de Vercel lo llama cada minuto (solo en producción) con
 * `Authorization: Bearer <CRON_SECRET>`. Rescata las tareas que quedaron colgadas, revisa que las actas en curso tengan encolado lo
 * que sigue y trabaja la cola durante ~230 s.
 * Es seguro que se solape con los empujones de las rutas: cada tarea se reclama de forma atómica.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const rescatadas = await vigilante();
    await avanzarActasEnCurso();
    const resumen = await trabajar({ presupuestoMs: 230_000 });
    return NextResponse.json({ ok: true, rescatadas, ...resumen });
  } catch (error) {
    console.error("[cron/process-meetings]", error);
    return NextResponse.json({ error: "No pudimos procesar la cola." }, { status: 500 });
  }
}
