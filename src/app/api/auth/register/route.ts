import { NextRequest, NextResponse } from "next/server";

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
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[register] Error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
