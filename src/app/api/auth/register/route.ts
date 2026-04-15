import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const { db } = await import("@/lib/db");
    const bcrypt = await import("bcryptjs");

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Ya existe una cuenta con este correo" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        passwordHash,
        // emailVerified stays null until code is confirmed
      },
    });

    // Generate 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Clean up any existing tokens for this email, then create new one
    await db.verificationToken.deleteMany({ where: { identifier: email } });
    await db.verificationToken.create({
      data: {
        identifier: email,
        token: hashedCode,
        expires,
      },
    });

    // Send verification email
    try {
      const { sendVerificationEmail } = await import("@/lib/email");
      await sendVerificationEmail(email, code);
    } catch (emailErr) {
      console.error("[register] Email send failed:", emailErr);
      // Don't fail registration if email fails — user can resend
    }

    return NextResponse.json({ success: true, needsVerification: true });
  } catch (e) {
    console.error("[register] Error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
