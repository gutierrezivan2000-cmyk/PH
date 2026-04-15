import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();

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

    // Mark email as verified
    await db.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });

    // Clean up token
    await db.verificationToken.deleteMany({ where: { identifier: email } });

    return NextResponse.json({ success: true, verified: true });
  } catch (e) {
    console.error("[verify] Error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
