import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { TRIAL_DAYS, OPEN_TESTING } from "@/lib/plan";
import { datosDeAceptacion } from "@/lib/legal/aceptacion";
import { LIMITES, normalizarCorreo, textoAcotado } from "@/lib/validar-entrada";
import { MENSAJE_CAPTCHA_FALLIDO, verificarCaptcha } from "@/lib/captcha";

const MAX_PASSWORD = 128;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const acepta = body.acepta === true;

    // Solo texto: un objeto o arreglo en estos campos llegaba tal cual a Prisma (500) o al hash.
    if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email.trim() || !body.password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 });
    }
        const password = body.password;

    // El correo es el identifier del código de verificación y comparte tabla con los tokens "pwreset:…" de la
    // recuperación: sin formato estricto (sin ":" ni espacios) alguien podía sembrar un código de 6 dígitos en ese
    // espacio de nombres y usarlo en reset-password.
    const email = normalizarCorreo(body.email);
    if (!email) {
      return NextResponse.json({ error: "Ingresa un correo electrónico válido" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
    }
    // Tope antes de bcrypt: una contraseña enorme gasta CPU y bcrypt solo usa los primeros 72 bytes.
    if (password.length > MAX_PASSWORD) {
      return NextResponse.json({ error: `La contraseña no puede pasar de ${MAX_PASSWORD} caracteres` }, { status: 400 });
    }

    // Nombre opcional, pero si viene debe ser texto corto (antes se guardaba entero, hasta el límite del cuerpo).
    let name = "";
    if (body.name !== undefined && body.name !== null && body.name !== "") {
      const nombreValido = textoAcotado(body.name, "El nombre", LIMITES.nombre);
      if (!nombreValido.ok) {
        return NextResponse.json({ error: nombreValido.error }, { status: 400 });
      }
      name = nombreValido.valor;
    }

    const { rateLimit, clientIp } = await import("@/lib/rate-limit");
    const ip = clientIp(req);

    // Captcha opcional (Turnstile, solo si hay TURNSTILE_SECRET_KEY): antes de tocar la base de datos, crear la cuenta o mandar
    // el código por correo, y antes de los límites para que un intento sin captcha no gaste el cupo de quien sí es una persona.
    const captcha = await verificarCaptcha(body.captchaToken, ip);
    if (!captcha.ok) {
      return NextResponse.json({ error: MENSAJE_CAPTCHA_FALLIDO }, { status: 400 });
    }

    const { db } = await import("@/lib/db");
    const bcrypt = await import("bcryptjs");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    // Rate limit to stop email bombing / trial-account farming.
    // failClosed: este endpoint manda correos con el código de verificación; si la base falla al contar, se deniega (429) en
    // vez de dejar pasar: sin contador no hay freno al envío masivo ni a la creación de cuentas de prueba.
    const HOUR = 60 * 60 * 1000;
    const ipLimit = await rateLimit(`register:ip:${ip}`, { max: 8, windowMs: HOUR, failClosed: true });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados registros desde esta red. Intenta más tarde." },
        { status: 429 }
      );
    }
    const emailLimit = await rateLimit(`register:email:${email}`, { max: 3, windowMs: HOUR, failClosed: true });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos con este correo. Espera un momento." },
        { status: 429 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let credencialesIntactas = false;
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerified) {
        return NextResponse.json({ error: "Ya existe una cuenta con este correo" }, { status: 409 });
      }
      // Las cuentas creadas con Google NUNCA tienen emailVerified (auth.ts no lo
      // escribe), así que caían aquí: cualquiera que supiera el correo podía
      // pisarles la contraseña y el nombre sin probar que es suyo. Una cuenta
      // sin passwordHash es de OAuth y no se toca.
      if (!existing.passwordHash) {
        return NextResponse.json(
          {
            error:
              "Ya existe una cuenta con este correo, creada con Google. Ingresa con el botón de Google.",
          },
          { status: 409 }
        );
      }
      // Reregistro de una cuenta por credenciales sin verificar (p. ej. el
      // correo de verificación nunca llegó): se manda un código nuevo y NO se
      // toca nada aquí. La contraseña se fija al verificar (quien verifica es
      // quien controla el buzón), así que la de este intento no se guarda.
      credencialesIntactas = true;
    } else {
      // Sin aceptación expresa de los términos y de la autorización de datos no se crea la cuenta.
      if (!acepta) {
        return NextResponse.json(
          { error: "Para crear tu cuenta debes aceptar los Términos y Condiciones y la Política de Privacidad." },
          { status: 400 }
        );
      }
      const created = await db.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          passwordHash,
          ...datosDeAceptacion(),
          // emailVerified stays null until code is confirmed
        },
      });

      // Fase de pruebas: no se crea suscripción de prueba. Esa fila vencería a
      // los 7 días y bloquearía al usuario en cuanto la fase termine.
      // Start the advertised 7-day free trial (Pro limits, no card).
      try {
        const now = new Date();
        if (!OPEN_TESTING) await db.subscription.create({
          data: {
            userId: created.id,
            status: "trialing",
            planId: "pro",
            currentPeriodStart: now,
            currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      } catch (subErr) {
        // Non-fatal: checkSubscriptionAccess lazy-creates the trial on first use.
        console.error("[register] trial subscription create failed:", subErr);
      }
    }

    // Generate 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();
    const hashedCode = crypto.createHash("sha256").update(code).digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.verificationToken.deleteMany({ where: { identifier: email } });
    await db.verificationToken.create({
      data: { identifier: email, token: hashedCode, expires },
    });
    // Código nuevo, intentos nuevos: el aviso de «demasiados intentos» pide solicitar un código nuevo, y sin esto seguía bloqueado.
    try {
      await db.rateLimit.deleteMany({ where: { key: `verify:${email}` } });
    } catch {
      /* mejor esfuerzo: el contador vence solo */
    }

    // Send verification email — report the outcome honestly so the UI can
    // tell the user when the code didn't go out instead of leaving them
    // stranded on /verify waiting for an email that never arrives.
    let emailSent = true;
    try {
      const { sendVerificationEmail } = await import("@/lib/email");
      await sendVerificationEmail(email, code);
    } catch (emailErr) {
      console.error("[register] Email send failed:", emailErr);
      emailSent = false;
    }

    return NextResponse.json({
      success: true,
      needsVerification: true,
      emailSent,
      // La pantalla lo usa para avisar de que la contraseña NO cambió, y que
      // quien no la recuerde use la recuperación.
      passwordUnchanged: credencialesIntactas,
    });
  } catch (e) {
    console.error("[register] Error:", e);
    return NextResponse.json(
      { error: "No pudimos crear tu cuenta. Intenta de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
