export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";

const IS_DEMO = process.env.DEMO_MODE === "true";

/** Full statement data for one unit (charges + payments). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  if (IS_DEMO) return NextResponse.json({ charges: [], payments: [] });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const { unitId } = await params;

  try {
    const { db } = await import("@/lib/db");
    const unit = await db.unit.findFirst({
      where: { id: unitId, userId },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }

    const [charges, payments] = await Promise.all([
      db.charge.findMany({
        where: { unitId },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      }),
      db.unitPayment.findMany({
        where: { unitId },
        orderBy: { receivedAt: "asc" },
      }),
    ]);

    return NextResponse.json({ charges, payments });
  } catch (error) {
    console.error("[cartera unit GET]", error);
    return NextResponse.json({ error: "Error al cargar el estado de cuenta" }, { status: 500 });
  }
}
