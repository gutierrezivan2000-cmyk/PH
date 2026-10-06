export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { demoNuevaSesionVivo } from "@/lib/meetings/demo";
import { puedeAgregarFuentes } from "@/lib/meetings/tipos";
import { reservarSesion } from "@/lib/meetings/vivo";

type Contexto = { params: Promise<{ id: string }> };

const CERRADA = "Esta reunión ya no admite más audio: se está procesando o ya está lista.";
const SIN_CONSTANCIA = "Antes de grabar, confirma que avisaste a los asistentes.";

/**
 * POST /api/meetings/[id]/live/sesion → { session, offsetMs }
 *
 * Reserva el número de la próxima sesión de grabación y dice dónde empieza dentro de la reunión (lo que
 * duraron las sesiones anteriores, aunque vengan de otro dispositivo). Dos dispositivos que empiezan a la vez
 * obtienen números distintos. Exige la constancia de que se avisó a los asistentes.
 */
export async function POST(_req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  if (ctx.demo) {
    const r = demoNuevaSesionVivo(ctx.userId, id);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : r.codigo === "tope" ? 400 : 409 });
    return NextResponse.json(r.valor);
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (!puedeAgregarFuentes(reunion.status)) return NextResponse.json({ error: CERRADA }, { status: 409 });
    if (!reunion.consentAt) return NextResponse.json({ error: SIN_CONSTANCIA }, { status: 409 });

    const r = await reservarSesion(id);
    if ("tope" in r) return NextResponse.json({ error: "Esta reunión ya tiene demasiadas sesiones de grabación." }, { status: 400 });
    return NextResponse.json(r);
  } catch (error) {
    console.error("[api/meetings/[id]/live/sesion]", error);
    return NextResponse.json({ error: "No pudimos preparar la grabación. Inténtalo de nuevo." }, { status: 500 });
  }
}
