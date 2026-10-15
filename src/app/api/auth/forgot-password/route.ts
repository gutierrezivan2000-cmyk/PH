import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { urlBase } from "@/lib/app-url";
import { normalizarCorreo, identificadorReset } from "@/lib/validar-entrada";
import { MENSAJE_CAPTCHA_FALLIDO, verificarCaptcha } from "@/lib/captcha";

const MENSAJE_NEUTRO = "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.";

/**
 * Dirección pública para el enlace del correo, o null si en producción no hay ninguna configurada. Se evalúa en cada petición
 * (nunca al cargar el módulo). Si falta, NO se crea el token ni se manda el correo: un enlace a localhost dejaría a la persona
 * en una página muerta y, de paso, invalidaría el enlace anterior que sí funcionaba. La respuesta sigue siendo la neutral.
 */
function direccionPublica(): string | null {
  try {
    return urlBase();
  } catch (e) {
    console.error("[forgot-password] no hay dirección pública configurada; no se envía el enlace:", e);
    return null;
  }
}

/**
 * Requests a password-reset link. Always returns 200 regardless of whether
 * the email exists (prevents account enumeration). The token is a random
 * 32-byte hex stored hashed in VerificationToken with a "pwreset:" prefix on
 * the identifier so it can't be replayed against the email-verification flow.
 *
 * Con TURNSTILE_SECRET_KEY configurada, antes de tocar la base de datos o mandar nada se exige `captchaToken`. Un fallo del
 * captcha se responde explícito (400): no depende de si el correo existe, así que no revela nada de las cuentas.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.email !== "string" || !body.email.trim()) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }
    // Mismo formato que register: el correo forma parte del identifier "pwreset:<correo>". Es validación de formato, no
    // depende de si la cuenta existe, así que no revela nada.
    const email = normalizarCorreo(body.email);
    if (!email) {
      return NextResponse.json({ error: "Ingresa un correo electrónico válido" }, { status: 400 });
    }

    const { rateLimit, clientIp } = await import("@/lib/rate-limit");
    const ip = clientIp(req);

    // Antes del límite por IP: un intento sin captcha no gasta cupo de quien sí es una persona, y no toca la base de datos.
    const captcha = await verificarCaptcha(body.captchaToken, ip);
    if (!captcha.ok) {
      return NextResponse.json({ error: MENSAJE_CAPTCHA_FALLIDO }, { status: 400 });
    }

    // Antes del limitador: sin la tabla RateLimit (base sin migrar) el limitador fallaba y no se mandaba ningún correo.
    const { ensureAdminSchema: asegurarEsquema } = await import("@/lib/ensure-admin-schema");
    await asegurarEsquema();

    // Rate limit per IP so this can't be used to spam reset emails.
    // failClosed: si la base falla al contar, NO se manda nada (sin contador no hay freno al envío masivo de correos). La
    // respuesta sigue siendo la neutral, igual que al alcanzar el límite.
    const ipLimit = await rateLimit(`forgot:ip:${ip}`, {
      max: 6,
      windowMs: 60 * 60 * 1000,
      failClosed: true,
    });
    if (!ipLimit.allowed) {
      // Still 200-shaped to avoid leaking anything; just don't send more.
      return NextResponse.json({ success: true, message: MENSAJE_NEUTRO });
    }

    // Igual que register: las columnas de User (passwordHash…) y la tabla VerificationToken existen en runtime solo si corrió el
    // SQL de ensureAdminSchema; sin esta llamada, en una base sin migrar la consulta fallaba y la persona veía un error 500.
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { db } = await import("@/lib/db");
    const user = await db.user.findUnique({ where: { email } });

    // Only accounts with a password can reset one (Google-only accounts sign
    // in with Google). Still return success to avoid enumeration.
    if (user?.passwordHash) {
      const identifier = identificadorReset(email);

      // Rate limit: one request per minute
      const recent = await db.verificationToken.findFirst({
        where: { identifier, expires: { gt: new Date(Date.now() + 29 * 60 * 1000) } },
      });
      const appUrl = recent ? null : direccionPublica();
      if (appUrl) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        await db.verificationToken.deleteMany({ where: { identifier } });
        await db.verificationToken.create({
          data: { identifier, token: hashed, expires },
        });

        const resetUrl = `${appUrl}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`;

        try {
          const { sendPasswordResetEmail } = await import("@/lib/email");
          await sendPasswordResetEmail(email, resetUrl);
        } catch (e) {
          console.error("[forgot-password] email send failed:", e);
          // Still return success — don't reveal account existence via errors.
        }
      }
    }

    return NextResponse.json({ success: true, message: MENSAJE_NEUTRO });
  } catch (e) {
    console.error("[forgot-password] Error:", e);
    return NextResponse.json({ error: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}
