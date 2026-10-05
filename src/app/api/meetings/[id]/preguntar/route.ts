export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureMeetingsSchema } from "@/lib/ensure-meetings-schema";
import { exigirVisible, reunionDelUsuario } from "@/lib/meetings/acceso";
import { TIPO_DE_USO_PREGUNTA, comprobarCupoDePreguntas } from "@/lib/meetings/cupo-preguntas";
import { demoPuedePreguntar, demoResponderPregunta } from "@/lib/meetings/demo-preguntar";
import { ErrorIA, crearClienteIA, tokensDeUso } from "@/lib/meetings/ia";
import { leerPedido, responderPregunta } from "@/lib/meetings/preguntar";
import { crearFlujoSSE } from "@/lib/meetings/sse";

type Contexto = { params: Promise<{ id: string }> };

/** Los encabezados de una respuesta SSE: sin caché y sin que un intermediario la junte (si no, el texto llegaría de golpe). */
const ENCABEZADOS_SSE = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

/** El código HTTP de cada motivo por el que no se puede preguntar. */
const CODIGOS = { no_existe: 404, no_lista: 409, sin_transcripcion: 409 } as const;

/** Lo que se le dice a la persona cuando la IA falla a mitad de la respuesta (nunca detalles internos). */
const mensajeDelFallo = (e: unknown): string => (e instanceof ErrorIA ? e.message : "No pudimos terminar la respuesta. Inténtalo de nuevo.");

/**
 * POST /api/meetings/[id]/preguntar { pregunta, historial? } → SSE
 *
 * Le pregunta a la reunión con la transcripción COMPLETA delante. `historial` son los turnos anteriores de la conversación
 * (`{ rol: "user" | "assistant", texto }`, máximo 10: la conversación no se guarda en el servidor). Los eventos:
 *   `inicio` {}                      la pregunta se aceptó
 *   `delta`  { texto }               un trozo de la respuesta, apenas llega
 *   `done`   { cortada, modelo }     terminó (`cortada`: llegó al tope de largo y se cortó)
 *   `error`  { mensaje }             falló a mitad de camino
 * La respuesta cita con `[[t=hh:mm:ss]]`: la pantalla lo vuelve un enlace que reproduce ese momento. Antes de empezar a
 * responder devuelve JSON: 400 (pregunta vacía o muy larga), 404, 409 (la reunión aún se procesa o no tiene transcripción), 429
 * (cada pregunta cuenta como un mensaje de agente del plan) o 503 (la IA no está configurada).
 */
export async function POST(req: NextRequest, { params }: Contexto) {
  const acceso = await exigirVisible();
  if ("error" in acceso) return acceso.error;
  const { ctx } = acceso;
  const { id } = await params;

  const pedido = leerPedido(await req.json().catch(() => null));
  if (!pedido.ok) return NextResponse.json({ error: pedido.error }, { status: 400 });

  if (ctx.demo) {
    const puede = demoPuedePreguntar(ctx.userId, id);
    if (!puede.ok) return NextResponse.json({ error: puede.error }, { status: CODIGOS[puede.codigo] });
    const flujo = crearFlujoSSE(async (enviar) => {
      enviar("inicio", {});
      const r = await demoResponderPregunta(ctx.userId, id, pedido.valor, { alTexto: (texto) => enviar("delta", { texto }) });
      enviar("done", { cortada: r.cortada, modelo: r.modelo });
    }, mensajeDelFallo);
    return new Response(flujo, { headers: ENCABEZADOS_SSE });
  }

  try {
    await ensureMeetingsSchema();
    const reunion = await reunionDelUsuario(id, ctx.userId);
    if (!reunion) return NextResponse.json({ error: "Reunión no encontrada" }, { status: 404 });
    if (reunion.status !== "lista") return NextResponse.json({ error: "Esta reunión todavía se está procesando." }, { status: 409 });
    if (!(await db.meetingUtterance.findFirst({ where: { meetingId: id }, select: { idx: true } }))) {
      return NextResponse.json({ error: "Esta reunión no tiene transcripción: no hay a qué preguntarle." }, { status: 409 });
    }

    const cupo = await comprobarCupoDePreguntas(ctx.userId);
    if (!cupo.permitido) return NextResponse.json({ error: cupo.mensaje ?? "Llegaste al límite de mensajes de tu plan." }, { status: 429 });

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("[api/meetings/[id]/preguntar] ANTHROPIC_API_KEY no está definida");
      return NextResponse.json({ error: "El servicio de IA no está configurado. Avisa a soporte." }, { status: 503 });
    }
    const ia = crearClienteIA();

    const flujo = crearFlujoSSE(async (enviar, senal) => {
      enviar("inicio", {});
      const r = await responderPregunta({ meetingId: id, userId: ctx.userId, pedido: pedido.valor, ia, senal, alTexto: (texto) => enviar("delta", { texto }) });
      if (!r.ok) {
        enviar("error", { mensaje: r.error });
        return;
      }
      // Cada pregunta queda registrada (su costo y sus tokens, y cuenta para el cupo). Un fallo aquí no tumba la respuesta.
      const { uso } = r.respuesta;
      await db.usageRecord
        .create({ data: { userId: ctx.userId, type: TIPO_DE_USO_PREGUNTA, tokens: Math.round(tokensDeUso(uso)), costUsd: uso.costoUsd } })
        .catch((e: unknown) => console.error("[api/meetings/[id]/preguntar] no se pudo registrar el uso de la pregunta", e));
      enviar("done", { cortada: r.respuesta.cortada, modelo: r.respuesta.modelo });
    }, mensajeDelFallo);
    return new Response(flujo, { headers: ENCABEZADOS_SSE });
  } catch (error) {
    console.error("[api/meetings/[id]/preguntar]", error);
    return NextResponse.json({ error: "No pudimos responder tu pregunta. Inténtalo de nuevo." }, { status: 500 });
  }
}
