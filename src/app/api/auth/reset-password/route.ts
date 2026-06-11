import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const token = body.token as string | undefined;
    const password = body.password as string | undefined;

    if (!email || !token || !password) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    const { db } = await import("@/lib/db");
    const identifier = `pwreset:${email}`;
    const hashed = crypto.createHash("sha256").update(token).digest("hex");

    const valid = await db.verificationToken.findFirst({
      where: { identifier, token: hashed, expires: { gt: new Date() } },
    });
    if (!valid) {
      return NextResponse.json(
        { error: "El enlace es inválido o expiró. Solicita uno nuevo." },
        { status: 400 }
      );
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);

    // Completing a reset also proves control of the email — verify the
    // account if it wasn't (rescues accounts stuck in unverified limbo).
    const updated = await db.user.updateMany({
      where: { email },
      data: { passwordHash, emailVerified: new Date() },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 400 });
    }

    await db.verificationToken.deleteMany({ where: { identifier } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[reset-password] Error:", e);
    return NextResponse.json({ error: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}
