import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email as string | undefined)?.trim().toLowerCase();
    const code = body.code as string | undefined;

    if (!email || !code) {
      return NextResponse.json({ error: "Email y codigo son requeridos" }, { status: 400 });
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

    // Mark email as verified (updateMany: no throw if the user row is missing,
    // and avoids leaking Prisma internals on mismatch)
    const updated = await db.user.updateMany({
      where: { email },
      data: { emailVerified: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json(
        { error: "No encontramos una cuenta con este correo. Regístrate de nuevo." },
        { status: 400 }
      );
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
