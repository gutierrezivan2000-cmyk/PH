import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const { db } = await import("@/lib/db");

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether the email exists
      return NextResponse.json({ success: true });
    }

    if (user.emailVerified) {
      return NextResponse.json({ error: "Este correo ya esta verificado" }, { status: 400 });
    }

    // Rate limit: check if a token was created recently (< 60 seconds)
    const recentToken = await db.verificationToken.findFirst({
      where: {
        identifier: email,
        expires: { gt: new Date(Date.now() + 14 * 60 * 1000) }, // Created < 1 min ago (15min - 14min)
      },
    });
    if (recentToken) {
      return NextResponse.json({ error: "Espera un minuto antes de reenviar" }, { status: 429 });
    }

    // Generate new code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await db.verificationToken.deleteMany({ where: { identifier: email } });
    await db.verificationToken.create({
      data: { identifier: email, token: hashedCode, expires },
    });

    try {
      const { sendVerificationEmail } = await import("@/lib/email");
      await sendVerificationEmail(email, code);
    } catch (emailErr) {
      console.error("[resend-code] Email send failed:", emailErr);
      return NextResponse.json({ error: "Error al enviar el correo. Intenta de nuevo." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[resend-code] Error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
