export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AGENTS } from "@/lib/agents";

const IS_DEMO = process.env.DEMO_MODE === "true";

/**
 * One-shot Hermes drafting for the comunicados module. This does NOT unlock
 * the full Hermes chat agent (that stays an add-on) — it's a single
 * "redáctame esta circular" call embedded in the module, available to every
 * active plan. Cost ≈ USD $0.01–0.03 per draft; rate-limited per user.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { propertyName, brief } = body as { propertyName?: string; brief?: string };

  if (!brief?.trim() || brief.length > 1500) {
    return NextResponse.json(
      { error: "Describe brevemente qué debe comunicar la circular (máx. 1500 caracteres)." },
      { status: 400 }
    );
  }

  if (IS_DEMO) {
    return NextResponse.json({
      subject: "Comunicado de la administración",
      content: `Estimados residentes:\n\n${brief.trim()}\n\nAgradecemos su atención.\n\nCordialmente,\nLa Administración`,
    });
  }

  try {
    const { checkSubscriptionAccess, recordUsage } = await import("@/lib/usage");
    const access = await checkSubscriptionAccess(session.user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason || "Necesitas una suscripción activa." },
        { status: 403 }
      );
    }

    // Protect AI spend: 10 drafts per hour per user.
    const { rateLimit } = await import("@/lib/rate-limit");
    const rl = await rateLimit(`draft-comunicado:${session.user.id}`, {
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Alcanzaste el límite de borradores por hora. Intenta más tarde." },
        { status: 429 }
      );
    }

    const { generateWithClaude } = await import("@/lib/ai-client");

    const system = `${AGENTS.hermes.systemPrompt}

Tarea especifica: redacta UNA circular/comunicado oficial listo para enviar por correo a los residentes de una copropiedad.
Formato de salida OBLIGATORIO:
- Primera linea: "ASUNTO: <asunto corto y claro, max 100 caracteres>"
- Linea en blanco
- Cuerpo del comunicado (saludo, contenido claro y cordial, despedida y firma "La Administración").
No agregues nada fuera de ese formato. No uses markdown ni asteriscos.`;

    const user = `Copropiedad: ${propertyName || "la copropiedad"}.
Lo que debe comunicar: ${brief.trim()}`;

    const { text, tokensUsed } = await generateWithClaude(system, user);

    // Parse "ASUNTO: ..." first line; the rest is the body.
    let subject = "Comunicado de la administración";
    let content = text.trim();
    const match = content.match(/^ASUNTO:\s*(.+)$/im);
    if (match) {
      subject = match[1].trim().slice(0, 150);
      content = content.replace(/^ASUNTO:\s*.+$/im, "").trim();
    }

    // Blended Sonnet pricing (~USD $9/M tokens avg in+out) — small drafts.
    await recordUsage(
      session.user.id,
      tokensUsed,
      (tokensUsed / 1_000_000) * 9,
      "comunicado_draft"
    ).catch(() => {});

    return NextResponse.json({ subject, content });
  } catch (error) {
    console.error("[announcements draft]", error);
    const detail = error instanceof Error ? error.message : String(error);
    // Surface the real cause (admin-only beta tool) so failures are diagnosable.
    return NextResponse.json(
      { error: `No se pudo generar el borrador. Detalle: ${detail}`.slice(0, 400) },
      { status: 500 }
    );
  }
}
