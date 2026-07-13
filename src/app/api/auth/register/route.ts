import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { TRIAL_DAYS } from "@/lib/plan";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const password = body.password as string | undefined;
    const name = body.name as string | undefined;
    const email = (body.email as string | undefined)?.trim().toLowerCase();

    if (!email || !password) {
      return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    const { db } = await import("@/lib/db");
    const bcrypt = await import("bcryptjs");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    // Rate limit to stop email bombing / trial-account farming.
    const { rateLimit, clientIp } = await import("@/lib/rate-limit");
    const ip = clientIp(req);
    const HOUR = 60 * 60 * 1000;
    const ipLimit = await rateLimit(`register:ip:${ip}`, { max: 8, windowMs: HOUR });
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados registros desde esta red. Intenta más tarde." },
        { status: 429 }
      );
    }
    const emailLimit = await rateLimit(`register:email:${email}`, { max: 3, windowMs: HOUR });
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos con este correo. Espera un momento." },
        { status: 429 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.emailVerified) {
        return NextResponse.json({ error: "Ya existe una cuenta con este correo" }, { status: 409 });
      }
      // Unverified account re-registering (e.g. the verification email never
      // arrived): refresh credentials and send a new code instead of locking
      // them out with a 409 forever.
      await db.user.update({
        where: { id: existing.id },
        data: { passwordHash, ...(name ? { name } : {}) },
      });
    } else {
      const created = await db.user.create({
        data: {
          email,
          name: name || email.split("@")[0],
          passwordHash,
          // emailVerified stays null until code is confirmed
        },
      });

      // Start the advertised 7-day free trial (Pro limits, no card).
      try {
        const now = new Date();
        await db.subscription.create({
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

    return NextResponse.json({ success: true, needsVerification: true, emailSent });
  } catch (e) {
    console.error("[register] Error:", e);
    return NextResponse.json(
      { error: "No pudimos crear tu cuenta. Intenta de nuevo en unos minutos." },
      { status: 500 }
    );
  }
}
