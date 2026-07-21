export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TYPES = ["extraordinaria", "otro", "interes"] as const;

/** Create an individual (non-monthly) charge for a unit. */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, unitId, concept, amount, dueDate, type } = body as {
    propertyId?: string;
    unitId?: string;
    concept?: string;
    amount?: number;
    dueDate?: string;
    type?: string;
  };

  const amt = Math.round(Number(amount));
  if (
    !propertyId ||
    !unitId ||
    !concept?.trim() ||
    !Number.isFinite(amt) ||
    amt <= 0 ||
    amt > 1_000_000_000
  ) {
    return NextResponse.json({ error: "Concepto y monto son requeridos." }, { status: 400 });
  }
  if (!TYPES.includes((type || "otro") as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "Tipo de cobro inválido." }, { status: 400 });
  }
  const due = dueDate ? new Date(`${dueDate}T12:00:00`) : new Date();
  if (Number.isNaN(due.getTime())) {
    return NextResponse.json({ error: "Fecha límite inválida." }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const unit = await db.unit.findFirst({
      where: { id: unitId, propertyId, userId },
      select: { id: true },
    });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }

    const charge = await db.charge.create({
      data: {
        userId,
        propertyId,
        unitId,
        concept: concept.trim().slice(0, 200),
        type: (type || "otro") as string,
        amount: amt,
        dueDate: due,
      },
    });

    return NextResponse.json({ ok: true, id: charge.id }, { status: 201 });
  } catch (error) {
    console.error("[cartera charges POST]", error);
    return NextResponse.json({ error: "Error al crear el cobro" }, { status: 500 });
  }
}

/** Delete a charge — only while nothing has been applied to it. */
export async function DELETE(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const charge = await db.charge.findFirst({
      where: { id, userId },
      select: { id: true, paidAmount: true },
    });
    if (!charge) {
      return NextResponse.json({ error: "Cobro no encontrado" }, { status: 404 });
    }
    if (charge.paidAmount > 0) {
      return NextResponse.json(
        { error: "Este cobro ya tiene pagos aplicados — elimina primero esos pagos." },
        { status: 400 }
      );
    }
    await db.charge.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cartera charges DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar el cobro" }, { status: 500 });
  }
}
