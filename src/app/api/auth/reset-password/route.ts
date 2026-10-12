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
    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    // Esta entrada no tenía freno. El token es de 256 bits (no se adivina), pero
    // sí se podía inundar la base con comprobaciones. Se limita por IP y no por
    // correo: así nadie puede bloquear el restablecimiento de otra persona solo
    // con conocer su correo. failClosed: si la base falla, se deniega.
    const { rateLimit, clientIp } = await import("@/lib/rate-limit");
    const attempt = await rateLimit(`reset:ip:${clientIp(req)}`, {
      max: 20,
      windowMs: 15 * 60 * 1000,
      failClosed: true,
    });
    if (!attempt.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." },
        { status: 429 }
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
    // `passwordChangedAt` desconecta las sesiones ya emitidas: con estrategia
    // JWT la sesión vive en la cookie, así que quien hubiera robado una seguía
    // dentro después de que la víctima cambiara la contraseña.
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema().catch(() => {});
    const updated = await db.user.updateMany({
      where: { email },
      data: { passwordHash, emailVerified: new Date(), passwordChangedAt: new Date() },
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
