export const runtime = "nodejs";
// El trabajador que arranca `empujar()` corre dentro de esta duración: tiene que alcanzar para su presupuesto (230 s).
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { checkUsageLimits } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_ACTAS_EN_CURSO, conCandadoDeGeneracion } from "@/lib/meetings/candado-generacion";
import { reanudarActa, iniciarActa, type ComprobarCupo } from "@/lib/meetings/acta-orquestador";
import { leerActa } from "@/lib/meetings/acta-estado";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { almacenBlob } from "@/lib/meetings/almacen-blob";
import { hayTrabajoSinAtender } from "@/lib/meetings/cola";
import { demoActa, demoIniciarActa } from "@/lib/meetings/demo-acta";
import { empujar } from "@/lib/meetings/empujon";

type Contexto = { params: Promise<{ id: string }> };

const NO_ENCONTRADA = () => NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });

/** El código HTTP de cada motivo por el que no se puede pedir el acta. */
const CODIGOS = { no_existe: 404, no_lista: 409, sin_transcripcion: 409, no_en_error: 409, sin_cupo: 429 } as const;

/**
 * GET /api/meetings/[id]/acta[?texto=1] → { acta, texto }
 *
 * `acta` es la más reciente de la reunión (null si todavía no se pidió ninguna): su estado, el avance, lo pendiente de
 * verificar, los requisitos legales y dónde abrirla. Con `?texto=1` y el acta lista, `texto` trae el acta con sus marcadores
 * (`[[D1]]`, `[[t=00:41:05]]`) para mostrarla con los minutos enlazados al audio. Mientras se redacta, además empuja el
 * trabajo: si hay tareas listas y nadie las atiende, arranca un trabajador (las vistas previas no tienen cron).
 */
export async function GET(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;
  const conTexto = req.nextUrl.searchParams.get("texto") === "1";

  if (ctx.demo) {
    const r = demoActa(ctx.userId, id, { conTexto });
    return r ? NextResponse.json(r, { headers: { "Cache-Control": "no-store" } }) : NO_ENCONTRADA();
  }

  try {
    await ensureMeetingsSchema();
    if (!(await reunionDelUsuario(id, ctx.userId))) return NO_ENCONTRADA();
    const r = await leerActa(id, { conTexto, almacen: almacenBlob() });
    if (r.acta?.estado === "procesando" && (await hayTrabajoSinAtender(id))) empujar();
    return NextResponse.json(r, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/meetings/[id]/acta GET]", error);
    return NextResponse.json({ error: "No pudimos cargar el acta." }, { status: 500 });
  }
}

/** El identificador de una generación: letras, números, guion y guion bajo. */
const ID_ACTA = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * POST /api/meetings/[id]/acta { reanudar?: string } → { acta, yaEnCurso }
 *
 * Pide el acta de la reunión: crea su generación y empieza a redactarla (la reunión tiene que estar lista). 201 si empezó;
 * 200 si ya había una en curso (un doble clic no gasta dos). Con `reanudar` —el identificador de un acta con error— retoma
 * esa: lo que ya se redactó se conserva y solo se repite lo que falló. 429 si el plan no tiene más generaciones.
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const cuerpo: unknown = await req.json().catch(() => ({}));
  const reanudar = typeof cuerpo === "object" && cuerpo !== null && "reanudar" in cuerpo ? (cuerpo as { reanudar: unknown }).reanudar : undefined;
  if (reanudar !== undefined && (typeof reanudar !== "string" || !ID_ACTA.test(reanudar))) {
    return NextResponse.json({ error: "El acta que quieres retomar no es válida." }, { status: 400 });
  }

  if (ctx.demo) {
    const r = demoIniciarActa(ctx.userId, id, { reanudar });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: CODIGOS[r.codigo] });
    return NextResponse.json(r.valor, { status: r.valor.yaEnCurso || reanudar ? 200 : 201 });
  }

  try {
    await ensureMeetingsSchema();
    if (!(await reunionDelUsuario(id, ctx.userId))) return NO_ENCONTRADA();

    const comprobarCupo: ComprobarCupo = async () => {
      const r = await checkUsageLimits(ctx.userId);
      return { permitido: r.allowed, mensaje: r.reason };
    };

    // Freno a las ráfagas: cada acta llama a IA de pago. Va antes de cualquier trabajo pesado.
    const rl = await rateLimit(`acta:${ctx.userId}`, { max: 3, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Estás pidiendo actas muy seguido. Espera un minuto e intenta de nuevo." },
        { status: 429, headers: rl.retryAfterSec ? { "Retry-After": String(rl.retryAfterSec) } : undefined },
      );
    }

    // Comprobar el cupo y crear la generación como UNA sola operación por usuario (candado de asesoría): sin él, una ráfaga de
    // peticiones leía todas el mismo conteo y superaba el tope del plan.
    type Reserva = { ok: true; creada: boolean; yaEnCurso: boolean } | { ok: false; status: number; error: string };
    const reserva = await conCandadoDeGeneracion<Reserva>(ctx.userId, async (tx) => {
      // Tope de actas redactándose a la vez. Pedir otra vez la de ESTA reunión (doble clic) no suma: devuelve la que está en curso.
      const estaEnCurso = await tx.generation.count({ where: { userId: ctx.userId, meetingId: id, type: "acta", status: { in: ["pending", "processing"] } } });
      if (estaEnCurso === 0) {
        const enCurso = await tx.generation.count({ where: { userId: ctx.userId, meetingId: { not: id }, type: "acta", status: { in: ["pending", "processing"] } } });
        if (enCurso >= MAX_ACTAS_EN_CURSO) {
          return { ok: false, status: 429, error: "Ya tienes actas redactándose. Espera a que terminen para pedir otra." };
        }
      }
      if (reanudar) {
        const r = await reanudarActa(id, reanudar, new Date(), comprobarCupo);
        if (!r.ok) return { ok: false, status: CODIGOS[r.codigo], error: r.error };
        return { ok: true, creada: false, yaEnCurso: false };
      }
      const r = await iniciarActa({ meetingId: id, userId: ctx.userId, comprobarCupo });
      if (!r.ok) return { ok: false, status: CODIGOS[r.codigo], error: r.error };
      return { ok: true, creada: !r.yaEnCurso, yaEnCurso: r.yaEnCurso };
    });
    if (!reserva.ok) return NextResponse.json({ error: reserva.error }, { status: reserva.status });
    const { creada, yaEnCurso } = reserva;

    empujar();
    const { acta } = await leerActa(id);
    return NextResponse.json({ acta, yaEnCurso }, { status: creada ? 201 : 200 });
  } catch (error) {
    console.error("[api/meetings/[id]/acta POST]", error);
    return NextResponse.json({ error: "No pudimos empezar el acta. Inténtalo de nuevo." }, { status: 500 });
  }
}
