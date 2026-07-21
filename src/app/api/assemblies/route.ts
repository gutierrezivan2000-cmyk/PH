export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TYPES = ["ordinaria", "extraordinaria"] as const;
const MODALITIES = ["presencial", "virtual", "mixta"] as const;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (IS_DEMO) return NextResponse.json({ assemblies: [] });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const where: { userId: string; propertyId?: string } = { userId: session.user.id };
    if (propertyId) where.propertyId = propertyId;

    const assemblies = await db.assembly.findMany({
      where,
      orderBy: { date: "desc" },
      take: 50,
      include: { property: { select: { name: true } } },
    });
    return NextResponse.json({ assemblies });
  } catch (error) {
    console.error("[assemblies GET]", error);
    return NextResponse.json({ error: "Error al cargar asambleas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { propertyId, type, date, modality, location, agenda } = body as {
    propertyId?: string;
    type?: string;
    date?: string; // ISO datetime
    modality?: string;
    location?: string;
    agenda?: string[];
  };

  if (!propertyId || !TYPES.includes(type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "Tipo de asamblea inválido." }, { status: 400 });
  }
  const when = date ? new Date(date) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ error: "Fecha y hora inválidas." }, { status: 400 });
  }
  if (!MODALITIES.includes((modality || "presencial") as (typeof MODALITIES)[number])) {
    return NextResponse.json({ error: "Modalidad inválida." }, { status: 400 });
  }
  const agendaItems = (Array.isArray(agenda) ? agenda : [])
    .map((s) => String(s).trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 40);
  if (agendaItems.length === 0) {
    return NextResponse.json(
      { error: "El orden del día necesita al menos un punto." },
      { status: 400 }
    );
  }

  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { checkSubscriptionAccess } = await import("@/lib/usage");

    const access = await checkSubscriptionAccess(session.user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason || "Necesitas una suscripción activa." },
        { status: 403 }
      );
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const assembly = await db.assembly.create({
      data: {
        userId: session.user.id,
        propertyId,
        type: type as string,
        date: when,
        modality: (modality || "presencial") as string,
        location: location?.trim().slice(0, 300) || null,
        agenda: agendaItems,
      },
    });

    // Legal-notice check (Art. 39: ≥15 días calendario for ordinaria).
    const daysNotice = Math.floor(
      (new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime() -
        new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
        86400000
    );

    return NextResponse.json(
      { ok: true, id: assembly.id, daysNotice },
      { status: 201 }
    );
  } catch (error) {
    console.error("[assemblies POST]", error);
    return NextResponse.json({ error: "Error al crear la asamblea" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, action } = body as { id?: string; action?: string };
  const ACTIONS = ["mark_convoked", "acta_ready", "mark_done", "cancel", "restore"];
  if (!id || !ACTIONS.includes(action || "")) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  if (IS_DEMO) return NextResponse.json({ ok: true });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const existing = await db.assembly.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Asamblea no encontrada" }, { status: 404 });
    }

    const data =
      action === "mark_convoked"
        ? { convokedAt: new Date() }
        : action === "acta_ready"
          ? { actaReadyAt: new Date(), status: "realizada" }
          : action === "mark_done"
            ? { status: "realizada" }
            : action === "cancel"
              ? { status: "cancelada" }
              : { status: "convocada" };

    await db.assembly.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[assemblies PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
