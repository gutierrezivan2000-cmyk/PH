import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    // El único freno era un token reciente en base, que solo cuenta por correo
    // y solo tras haber enviado uno: no impedía barrer miles de direcciones ni
    // bombardear un buzón alternando correos. Se limita por IP y por correo,
    // igual que en register.
    const { rateLimit, clientIp } = await import("@/lib/rate-limit");
    const HOUR = 60 * 60 * 1000;
    const [ipRl, mailRl] = await Promise.all([
      rateLimit(`resend:ip:${clientIp(req)}`, { max: 10, windowMs: HOUR }),
      rateLimit(`resend:email:${email}`, { max: 5, windowMs: HOUR }),
    ]);
    if (!ipRl.allowed || !mailRl.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera un momento." },
        { status: 429 }
      );
    }

    const { db } = await import("@/lib/db");

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      // Don't reveal whether the email exists
      return NextResponse.json({ success: true });
    }

    // Antes respondía 400 "ya esta verificado" solo para las cuentas que
    // existen y están verificadas: comparando esa respuesta con el 200 de una
    // dirección desconocida se podía saber qué correos tienen cuenta.
    if (user.emailVerified) {
      return NextResponse.json({ success: true });
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
