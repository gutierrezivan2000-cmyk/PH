export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoReanalizar } from "@/lib/meetings/demo";
import { empujar } from "@/lib/meetings/empujon";
import { reanalizarResumen } from "@/lib/meetings/reanalisis";

type Contexto = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/reanalyze → { status: "procesando", fragmentos }
 *
 * «Generar el resumen otra vez»: cuando la IA no pudo, vuelve a analizar SOLO los fragmentos que se omitieron y rehace la
 * ficha (lo ya analizado se conserva: es lo que cuesta). 409 si la reunión todavía se procesa, si ya tiene su resumen
 * completo o si no hay nada que resumir.
 */
export async function POST(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const r = demoReanalizar(ctx.userId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : 409 });
    return NextResponse.json(r.valor);
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

    const r = await reanalizarResumen(id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    empujar();
    return NextResponse.json({ status: "procesando", fragmentos: r.fragmentos });
  } catch (error) {
    console.error("[api/meetings/[id]/reanalyze]", error);
    return NextResponse.json({ error: "No pudimos pedir el resumen otra vez. Inténtalo de nuevo." }, { status: 500 });
  }
}
