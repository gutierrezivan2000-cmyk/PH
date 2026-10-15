import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { normalizarCorreo, identificadorReset } from "@/lib/validar-entrada";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Mismo formato estricto que register: el correo forma parte del identifier del token ("pwreset:<correo>").
    const email = normalizarCorreo(body.email);
    const token = typeof body.token === "string" ? body.token : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;

    if (!email || !token || !password) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }

    // El token es de 256 bits (no se adivina): solo se limita por IP, para no poder inundar la base con comprobaciones. Un límite
    // por correo permitiría a un tercero gastarlo y dejar sin efecto el enlace que la persona recibió. failClosed: si la base
    // falla, se deniega. Antes se asegura el esquema: sin la tabla RateLimit el limitador fallaba y todos recibían 429.
    const { ensureAdminSchema: asegurarEsquema } = await import("@/lib/ensure-admin-schema");
    await asegurarEsquema().catch(() => {});
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

    // El token de recuperación siempre son 64 hex (32 bytes). Cualquier otra forma (p. ej. un código de 6 dígitos del
    // flujo de verificación) no puede ser válida: se rechaza sin consultar la base.
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      return NextResponse.json(
        { error: "El enlace es inválido o expiró. Solicita uno nuevo." },
        { status: 400 }
      );
    }

    const { db } = await import("@/lib/db");
    const identifier = identificadorReset(email);
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
      // Solo cuentas con contraseña: una cuenta de Google no debe poder recibir contraseña ni emailVerified por esta vía.
      where: { email, passwordHash: { not: null } },
      data: { passwordHash, emailVerified: new Date(), passwordChangedAt: new Date() },
    });
    if (updated.count === 0) {
      // Cuenta inexistente o de Google (sin contraseña): se gasta el token y no se cambia nada.
      return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 400 });
    }

    await db.verificationToken.deleteMany({ where: { identifier } });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[reset-password] Error:", e);
    return NextResponse.json({ error: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}
