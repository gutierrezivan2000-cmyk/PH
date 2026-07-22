export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const IS_DEMO = process.env.DEMO_MODE === "true";
const TOKEN_RE = /^[A-Za-z0-9_-]{16,48}$/;

/**
 * Resident reglamento assistant. Answers a resident's question STRICTLY from
 * their property's reglamento/manual. Public but gated by the unit portal
 * token + rate limited (AI cost protection on a public endpoint).
 */
export async function POST(req: NextRequest) {
  if (IS_DEMO) {
    return NextResponse.json({
      answer: "En modo demo el asistente del reglamento no está disponible, pero aquí aparecería la respuesta basada en el reglamento de tu copropiedad.",
    });
  }

  const body = await req.json().catch(() => ({}));
  const { token, question } = body as { token?: string; question?: string };

  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Enlace inválido." }, { status: 400 });
  }
  if (!question?.trim() || question.length > 500) {
    return NextResponse.json({ error: "Escribe tu pregunta (máx. 500 caracteres)." }, { status: 400 });
  }

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const { db } = await import("@/lib/db");
    const unit = await db.unit.findUnique({
      where: { portalToken: token },
      select: { propertyId: true, property: { select: { name: true } } },
    });
    if (!unit) return NextResponse.json({ error: "Enlace inválido." }, { status: 404 });

    // Anti-abuse: 15/hour per unit token, 40/hour per IP.
    const rl1 = await rateLimit(`assistant:unit:${token.slice(0, 24)}`, { max: 15, windowMs: 60 * 60 * 1000 });
    const rl2 = await rateLimit(`assistant:ip:${clientIp(req)}`, { max: 40, windowMs: 60 * 60 * 1000 });
    if (!rl1.allowed || !rl2.allowed) {
      return NextResponse.json({ error: "Has hecho muchas preguntas seguidas. Intenta en un rato." }, { status: 429 });
    }

    const { getReglamentoText } = await import("@/lib/reglamento");
    const reglamento = await getReglamentoText(unit.propertyId);
    if (!reglamento || reglamento.length < 40) {
      return NextResponse.json({
        answer: "Todavía no tengo el reglamento de la copropiedad cargado para responderte. Por favor escribe a la administración con tu consulta.",
        noDocs: true,
      });
    }

    const { generateWithClaude } = await import("@/lib/ai-client");
    const system = `Eres el asistente virtual de la copropiedad "${unit.property.name}". Respondes preguntas de los residentes ÚNICAMENTE con base en el reglamento de propiedad horizontal y el manual de convivencia que se te entregan a continuación.

Reglas:
- Responde en español, de forma clara, breve y amable.
- Básate SOLO en el texto del reglamento/manual. Si la respuesta no está ahí, dilo con honestidad: "El reglamento no menciona ese punto; te sugiero consultarlo con la administración." No inventes normas.
- Cuando sea útil, menciona el artículo o la sección donde aparece.
- No des asesoría legal externa ni opiniones personales; limítate al reglamento.

=== REGLAMENTO Y MANUAL DE LA COPROPIEDAD ===
${reglamento}
=== FIN DEL REGLAMENTO ===`;

    const { text } = await generateWithClaude(system, question.trim());
    return NextResponse.json({ answer: text.trim() });
  } catch (e) {
    console.error("[portal assistant]", e);
    const msg =
      e instanceof Error && /IA|API|saturado|creditos/i.test(e.message)
        ? "El asistente no está disponible en este momento. Intenta más tarde."
        : "No se pudo responder. Intenta de nuevo.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
