export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { computeUnitSummary, fmtCOP } from "@/lib/cartera";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TONES = ["recordatorio", "persuasivo", "prejuridico"] as const;
type Tone = (typeof TONES)[number];

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  recordatorio: `TONO: recordatorio amable (primer aviso). Cordial y constructivo: recuerda el saldo pendiente, invita a ponerse al día o acercarse a la administración, agradece si el pago ya fue realizado. Sin amenazas.`,
  persuasivo: `TONO: cobro persuasivo (segundo aviso, firme pero respetuoso). Detalla la deuda y su antigüedad, menciona que la mora causa intereses (hasta 1.5 veces el interés bancario corriente, Art. 30, Ley 675 de 2001), recuerda que las expensas son obligatorias y afectan la operación de la copropiedad, e invita a suscribir un acuerdo de pago con plazo concreto.`,
  prejuridico: `TONO: prejurídico (último aviso antes de cobro judicial). Formal y serio: otorga un plazo perentorio de diez (10) días hábiles, advierte que de no regularizarse la obligación se iniciará el cobro judicial — la certificación del administrador sobre la existencia y monto de la deuda presta mérito ejecutivo (Art. 48, Ley 675 de 2001) — y que los costos y agencias en derecho del proceso estarán a cargo del deudor. Aún ofrece la alternativa de acuerdo de pago inmediato.`,
};

/**
 * Collection letters powered by AI, with the unit's REAL debt data.
 * action "draft": generates subject+content. action "send": emails the
 * (possibly edited) letter to the unit's registered email (counts against
 * the monthly email quota).
 */
export async function POST(req: NextRequest) {
  if (IS_DEMO) {
    return NextResponse.json({
      subject: "Recordatorio de pago — Administración",
      content: "Modo demo: aquí aparecería la carta de cobro generada con los datos reales de la deuda.",
    });
  }

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId, accessStatus } = r;

  const body = await req.json().catch(() => ({}));
  const { action, unitId, tone, subject, content } = body as {
    action?: string;
    unitId?: string;
    tone?: string;
    subject?: string;
    content?: string;
  };

  if (!unitId || !["draft", "send"].includes(action || "")) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const unit = await db.unit.findFirst({
      where: { id: unitId, userId },
      include: { property: { select: { id: true, name: true } } },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }

    // ── Send the (edited) letter by email ──────────────────────────
    if (action === "send") {
      if (!subject?.trim() || !content?.trim()) {
        return NextResponse.json({ error: "Asunto y contenido son requeridos." }, { status: 400 });
      }
      if (!unit.email) {
        return NextResponse.json(
          { error: "Esta unidad no tiene correo registrado. Agrégalo en Comunicados → Destinatarios." },
          { status: 400 }
        );
      }
      const { checkEmailQuota, recordEmailsSent } = await import("@/lib/email-quota");
      const { sendAnnouncementEmails, textToEmailHtml } = await import("@/lib/email");

      const quota = await checkEmailQuota(userId, 1, accessStatus === "beta");
      if (!quota.allowed) {
        return NextResponse.json({ error: quota.reason, code: "email_quota" }, { status: 403 });
      }

      const admin = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, company: true, logoUrl: true, brandColor: true },
      });

      const { sent } = await sendAnnouncementEmails({
        recipients: [unit.email],
        subject: subject.trim().slice(0, 150),
        contentHtml: textToEmailHtml(content.slice(0, 10000)),
        propertyName: unit.property.name,
        senderName: admin?.company || admin?.name || "Administración",
        replyTo: admin?.email || undefined,
        logoUrl: admin?.logoUrl,
        brandColor: admin?.brandColor,
      });
      if (sent === 0) {
        return NextResponse.json(
          { error: "No se pudo enviar el correo. Intenta de nuevo." },
          { status: 502 }
        );
      }
      await recordEmailsSent(userId, sent);
      return NextResponse.json({ ok: true, sent });
    }

    // ── Draft with AI ──────────────────────────────────────────────
    if (!TONES.includes((tone || "") as Tone)) {
      return NextResponse.json({ error: "Tono inválido." }, { status: 400 });
    }

    // Protect AI spend: 10 letters per hour per user.
    const { rateLimit } = await import("@/lib/rate-limit");
    const rl = await rateLimit(`carta-cobro:${userId}`, { max: 10, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Alcanzaste el límite de cartas por hora. Intenta más tarde." },
        { status: 429 }
      );
    }

    const [charges, paymentsAgg, admin] = await Promise.all([
      db.charge.findMany({
        where: { unitId },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
        select: { concept: true, amount: true, paidAmount: true, dueDate: true },
      }),
      db.unitPayment.aggregate({ where: { unitId }, _sum: { amount: true } }),
      db.user.findUnique({
        where: { id: userId },
        select: { name: true, company: true },
      }),
    ]);
    const summary = computeUnitSummary(charges, paymentsAgg._sum.amount || 0, new Date());
    if (summary.balance <= 0) {
      return NextResponse.json(
        { error: "Esta unidad está al día — no hay deuda para cobrar." },
        { status: 400 }
      );
    }

    const openList = charges
      .filter((c) => c.amount - c.paidAmount > 0)
      .map(
        (c) =>
          `- ${c.concept}: ${fmtCOP(c.amount - c.paidAmount)} (vencía ${new Date(c.dueDate).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })})`
      )
      .join("\n");

    const { generateWithClaude } = await import("@/lib/ai-client");
    const system = `Eres Metra, la analista financiera de SOPH.IA para Propiedad Horizontal en Colombia, redactando una carta de cobro de expensas de administración.

${TONE_INSTRUCTIONS[(tone || "recordatorio") as Tone]}

Reglas:
- Carta lista para enviar: saludo al propietario/residente, cuerpo, cierre y firma "La Administración" (y el nombre de la administración si se proporciona).
- Usa EXACTAMENTE las cifras dadas; no inventes valores, fechas ni datos.
- Español formal colombiano. Extensión: 200-350 palabras. Sin markdown ni asteriscos.
- Formato de salida OBLIGATORIO: primera línea "ASUNTO: <asunto corto>", línea en blanco, y luego el cuerpo.`;

    const user = `Copropiedad: ${unit.property.name}
Unidad: ${unit.label}
Destinatario: ${unit.residentName || "Propietario/Residente de la unidad " + unit.label}
Administración: ${admin?.company || admin?.name || "La Administración"}

Deuda total: ${fmtCOP(summary.balance)}
En mora (vencido): ${fmtCOP(summary.overdueAmount)} — ${summary.overdueDays} días desde el vencimiento más antiguo
Detalle de conceptos pendientes:
${openList || "- (sin detalle)"}`;

    const { text, tokensUsed } = await generateWithClaude(system, user);

    let letterSubject = `Estado de su cuenta — ${unit.property.name}`;
    let letterContent = text.trim();
    const match = letterContent.match(/^ASUNTO:\s*(.+)$/im);
    if (match) {
      letterSubject = match[1].trim().slice(0, 150);
      letterContent = letterContent.replace(/^ASUNTO:\s*.+$/im, "").trim();
    }

    const { recordUsage } = await import("@/lib/usage");
    await recordUsage(userId, tokensUsed, (tokensUsed / 1_000_000) * 9, "carta_cobro").catch(
      () => {}
    );

    return NextResponse.json({ subject: letterSubject, content: letterContent });
  } catch (error) {
    console.error("[cartera carta]", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `No se pudo generar la carta. Detalle: ${detail}`.slice(0, 400) },
      { status: 500 }
    );
  }
}
