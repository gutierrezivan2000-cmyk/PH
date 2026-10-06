export const runtime = "nodejs";
// El trabajo que se empuja con after() corre dentro de este límite.
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { nombreDeSesion, planificarCierre, type ParteRecibida } from "@/lib/meetings/cierre";
import { demoProcesar } from "@/lib/meetings/demo";
import { empujar } from "@/lib/meetings/empujon";
import { iniciarProcesamiento } from "@/lib/meetings/proceso";
import { MAX_FUENTES_POR_REUNION, estaEnMarcha, puedeAgregarFuentes } from "@/lib/meetings/tipos";
import { validarCierre } from "@/lib/meetings/validar";

type Contexto = { params: Promise<{ id: string }> };

const FALTAN_PARTES = "Faltan partes de la grabación. Vuelve a enviarlas.";

/**
 * POST /api/meetings/[id]/process { sesiones?: [{ session, ultimaSecuencia, mimeType, duracionMs }] } → { status: "en_cola" }
 *
 * Cierra la captura y manda la reunión a procesar. Idempotente: si ya está en cola, procesándose o lista,
 * devuelve su estado sin tocar nada (el cliente puede reintentar sin miedo a duplicar el trabajo).
 *
 * Con `sesiones` (lo que la grabadora declara haber grabado) se comprueba que no falte ninguna parte: si
 * faltan, responde 409 con `{ faltan: [{ session, seq }] }` y la grabadora las vuelve a subir desde su
 * dispositivo. Cada sesión con audio pasa a ser una fuente más; las que nadie declaró (un dispositivo perdido)
 * se cierran con lo que haya recibido el servidor.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  // El cuerpo es opcional: sin él (o vacío) se cierra con lo que haya.
  const texto = await req.text().catch(() => "");
  let cuerpo: unknown = null;
  if (texto.trim()) {
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return NextResponse.json({ error: "Solicitud no válida." }, { status: 400 });
    }
  }
  const valida = validarCierre(cuerpo);
  if (!valida.ok) return NextResponse.json({ error: valida.error }, { status: 400 });
  const { sesiones } = valida.valor;

  if (ctx.demo) {
    const r = demoProcesar(ctx.userId, id, sesiones);
    if (!r.ok) {
      if (r.codigo === "faltan") return NextResponse.json({ error: r.error, faltan: r.faltan }, { status: 409 });
      return NextResponse.json({ error: r.error }, { status: r.codigo === "no_existe" ? 404 : r.codigo === "cerrada" || r.codigo === "pendiente" ? 409 : 400 });
    }
    return NextResponse.json(r.valor);
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (estaEnMarcha(reunion.status) || reunion.status === "lista") return NextResponse.json({ status: reunion.status });
    if (!puedeAgregarFuentes(reunion.status)) {
      return NextResponse.json({ error: "Esta reunión no se puede procesar en su estado actual." }, { status: 409 });
    }

    const [partes, fuentes] = await Promise.all([
      db.meetingLivePart.findMany({
        where: { meetingId: id, seq: { gte: 0 } },
        select: { session: true, seq: true, bytes: true, durationMs: true, mimeType: true },
      }),
      db.meetingSource.findMany({ where: { meetingId: id }, select: { idx: true, kind: true, session: true, status: true } }),
    ]);

    const plan = planificarCierre(partes as ParteRecibida[], fuentes, sesiones);
    if (plan.faltan.length > 0) return NextResponse.json({ error: FALTAN_PARTES, faltan: plan.faltan }, { status: 409 });

    const total = fuentes.length + plan.cerrar.length;
    if (total === 0) {
      return NextResponse.json({ error: "Sube al menos un archivo antes de procesar la reunión." }, { status: 400 });
    }
    if (total > MAX_FUENTES_POR_REUNION) {
      return NextResponse.json({ error: `Máximo ${MAX_FUENTES_POR_REUNION} archivos por reunión.` }, { status: 400 });
    }
    if (fuentes.some((f) => f.status !== "recibida")) {
      return NextResponse.json({ error: "Algún archivo todavía se está preparando. Espera un momento." }, { status: 409 });
    }

    // Cada sesión de grabación pasa a ser una fuente más de la línea de tiempo.
    let idx = fuentes.reduce((m, f) => Math.max(m, f.idx), -1) + 1;
    for (const c of plan.cerrar) {
      await db.meetingSource.create({
        data: {
          meetingId: id,
          idx: idx++,
          kind: "grabacion",
          session: c.session,
          name: nombreDeSesion(c.session, plan.cerrar.length),
          mimeType: c.mimeType,
          sizeBytes: c.sizeBytes,
          durationMs: c.durationMs,
          status: "recibida",
        },
      });
    }

    await iniciarProcesamiento(id);
    empujar(); // sin esperar al cron: el trabajo arranca cuando ya se respondió
    return NextResponse.json({ status: "en_cola" });
  } catch (error) {
    console.error("[api/meetings/[id]/process]", error);
    return NextResponse.json({ error: "No pudimos enviar la reunión a procesar. Inténtalo de nuevo." }, { status: 500 });
  }
}
