export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { reintentarFallidas } from "@/lib/meetings/cola";
import { demoReintentar } from "@/lib/meetings/demo";
import { empujar } from "@/lib/meetings/empujon";

type Contexto = { params: Promise<{ id: string }> };

/**
 * POST /api/meetings/[id]/retry → { status: "procesando" }
 *
 * «Reintentar» una reunión que quedó en error: vuelve a intentar SOLO lo fallido (lo ya hecho no se repite) y empuja
 * al trabajador. Idempotente: si ya no está en error, devuelve su estado sin tocar nada.
 */
export async function POST(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const r = demoReintentar(ctx.userId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : 409 });
    return NextResponse.json(r.valor);
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (reunion.status !== "error") return NextResponse.json({ status: reunion.status });

    const n = await reintentarFallidas(id);
    if (n === 0) return NextResponse.json({ error: "No hay nada que reintentar en esta reunión." }, { status: 409 });
    empujar();
    return NextResponse.json({ status: "procesando" });
  } catch (error) {
    console.error("[api/meetings/[id]/retry]", error);
    return NextResponse.json({ error: "No pudimos reintentar. Inténtalo de nuevo." }, { status: 500 });
  }
}
