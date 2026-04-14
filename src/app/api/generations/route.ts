import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGenerations, DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (IS_DEMO) {
    return NextResponse.json(getGenerations(DEMO_USER.id));
  }

  try {
    const { db } = await import("@/lib/db");
    const generations = await db.generation.findMany({
      where: { userId: session.user.id },
      include: { property: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(generations);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error de base de datos: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
