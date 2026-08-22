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
    // Tope y columnas explícitas. Era el único listado del proyecto sin `take`
    // (certificados 100, asambleas 50, comunicados 50, PQRS 100), y con
    // `include: { property: true }` mandaba al navegador la fila entera de la
    // propiedad más `inputText` (hasta 20.000 caracteres por fila) e
    // `inputFiles` con las URLs de los blobs. La UI no lee ninguno de los dos:
    // el historial usa lo que se selecciona aquí y el panel solo los 4 primeros.
    const generations = await db.generation.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        type: true,
        status: true,
        month: true,
        year: true,
        tokensUsed: true,
        costUsd: true,
        createdAt: true,
        outputFiles: true,
        property: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
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
