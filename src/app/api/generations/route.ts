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

    // Replace raw blob URLs with proxy download URLs
    const mapped = generations.map((g) => {
      const out = g.outputFiles as Record<string, string> | null;
      if (!out) return g;
      const proxy: Record<string, string> = {};
      if (out.informeHtml) proxy.informeHtml = `/api/download/${g.id}/informe`;
      if (out.actaHtml) proxy.actaHtml = `/api/download/${g.id}/acta`;
      if (out.presentacionPptx) proxy.presentacionPptx = `/api/download/${g.id}/pptx`;
      return { ...g, outputFiles: Object.keys(proxy).length > 0 ? proxy : null };
    });

    return NextResponse.json(mapped);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error de base de datos: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
