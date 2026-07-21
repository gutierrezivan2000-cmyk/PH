export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TYPES = ["ingreso", "gasto", "fondo_aporte", "fondo_retiro"] as const;

/** Register an actual income/expense movement (ejecución) or a fund movement. */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, date, concept, itemId, type, amount, note } = body as {
    propertyId?: string;
    date?: string;
    concept?: string;
    itemId?: string | null;
    type?: string;
    amount?: number;
    note?: string;
  };

  const amt = Math.round(Number(amount));
  if (!propertyId || !concept?.trim() || !Number.isFinite(amt) || amt <= 0 || amt > 100_000_000_000) {
    return NextResponse.json({ error: "Concepto y monto son requeridos." }, { status: 400 });
  }
  if (!TYPES.includes((type || "") as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "Tipo de movimiento inválido." }, { status: 400 });
  }
  const when = date ? new Date(`${date}T12:00:00`) : new Date();
  if (Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const property = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    // Fund movements never carry a rubro; ordinary ones may.
    const isFondo = type === "fondo_aporte" || type === "fondo_retiro";
    const entry = await db.ledgerEntry.create({
      data: {
        userId,
        propertyId,
        date: when,
        concept: concept.trim().slice(0, 120),
        itemId: isFondo ? null : itemId?.slice(0, 40) || null,
        type: type as string,
        amount: amt,
        note: note?.trim().slice(0, 300) || null,
      },
    });

    return NextResponse.json({ ok: true, id: entry.id }, { status: 201 });
  } catch (error) {
    console.error("[movimientos POST]", error);
    return NextResponse.json({ error: "Error al registrar el movimiento" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

  try {
    const { db } = await import("@/lib/db");
    const entry = await db.ledgerEntry.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!entry) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
    }
    await db.ledgerEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[movimientos DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
