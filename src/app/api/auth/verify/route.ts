import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const code = body.code as string | undefined;
    const password = body.password as string | undefined;

    if (!email || !code) {
      return NextResponse.json({ error: "Email y código son requeridos" }, { status: 400 });
    }

    // Throttle guesses: the code is only 6 digits, so cap attempts per email.
    // failClosed: sin contador no hay freno, así que si la base falla se deniega.
    const { rateLimit } = await import("@/lib/rate-limit");
    const attempt = await rateLimit(`verify:${email}`, {
      max: 10,
      windowMs: 15 * 60 * 1000,
      failClosed: true,
    });
    if (!attempt.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos y solicita un código nuevo." },
        { status: 429 }
      );
    }

    // La contraseña la fija QUIEN VERIFICA, no quien registró el correo. Si la
    // fijara el registro, quien registrara primero el correo ajeno dejaría su
    // propia contraseña en la cuenta de la víctima en cuanto ella verificara.
    // Quien verifica es quien demuestra que controla el buzón.
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Escribe la contraseña con la que vas a entrar (mínimo 8 caracteres)." },
        { status: 400 }
      );
    }

    const { db } = await import("@/lib/db");
    const hashedCode = crypto.createHash("sha256").update(code.trim()).digest("hex");

    // Find valid token
    const token = await db.verificationToken.findFirst({
      where: {
        identifier: email,
        token: hashedCode,
        expires: { gt: new Date() },
      },
    });

    if (!token) {
      return NextResponse.json({ error: "Codigo invalido o expirado" }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email }, select: { passwordHash: true } });
    if (!user) {
      return NextResponse.json(
        { error: "No encontramos una cuenta con este correo. Regístrate de nuevo." },
        { status: 400 }
      );
    }
    // Una cuenta de Google no tiene contraseña de correo: no se le añade una desde aquí.
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "Esta cuenta se creó con Google. Ingresa con el botón de Google." },
        { status: 409 }
      );
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);

    // updateMany con emailVerified null: si dos verificaciones llegan a la vez, solo una gana.
    const updated = await db.user.updateMany({
      where: { email, emailVerified: null },
      data: { emailVerified: new Date(), passwordHash },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Esta cuenta ya fue verificada. Inicia sesión." }, { status: 409 });
    }

    // Clean up token
    await db.verificationToken.deleteMany({ where: { identifier: email } });

    return NextResponse.json({ success: true, verified: true });
  } catch (e) {
    console.error("[verify] Error:", e);
    return NextResponse.json(
      { error: "No pudimos verificar tu cuenta. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
