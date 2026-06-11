import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * Requests a password-reset link. Always returns 200 regardless of whether
 * the email exists (prevents account enumeration). The token is a random
 * 32-byte hex stored hashed in VerificationToken with a "pwreset:" prefix on
 * the identifier so it can't be replayed against the email-verification flow.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email requerido" }, { status: 400 });
    }

    const { db } = await import("@/lib/db");
    const user = await db.user.findUnique({ where: { email } });

    // Only accounts with a password can reset one (Google-only accounts sign
    // in with Google). Still return success to avoid enumeration.
    if (user?.passwordHash) {
      const identifier = `pwreset:${email}`;

      // Rate limit: one request per minute
      const recent = await db.verificationToken.findFirst({
        where: { identifier, expires: { gt: new Date(Date.now() + 29 * 60 * 1000) } },
      });
      if (!recent) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        await db.verificationToken.deleteMany({ where: { identifier } });
        await db.verificationToken.create({
          data: { identifier, token: hashed, expires },
        });

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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

    return NextResponse.json({
      success: true,
      message: "Si existe una cuenta con ese correo, recibirás un enlace para restablecer tu contraseña.",
    });
  } catch (e) {
    console.error("[forgot-password] Error:", e);
    return NextResponse.json({ error: "Error interno. Intenta de nuevo." }, { status: 500 });
  }
}
