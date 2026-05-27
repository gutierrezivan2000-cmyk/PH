export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { id } = await params;

  const [subscription, auditLogs] = await Promise.all([
    db.subscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            cargo: true,
            phone: true,
            company: true,
            city: true,
            createdAt: true,
          },
        },
      },
    }),
    db.adminAuditLog.findMany({
      where: { targetType: "subscription", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { admin: { select: { name: true, email: true } } },
    }),
  ]);

  if (!subscription) {
    return NextResponse.json(
      { error: "Suscripción no encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json({ subscription, auditLogs });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;

  const { id } = await params;

  const existing = await db.subscription.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Suscripción no encontrada" },
      { status: 404 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const {
    status,
    addonAgents,
    adminNotes,
    planId,
  } = body as {
    status?: string;
    addonAgents?: string[];
    adminNotes?: string;
    planId?: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (status !== undefined) {
    const validStatuses = ["active", "inactive", "canceled", "past_due"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Estado inválido." },
        { status: 400 }
      );
    }
    updateData.status = status;
  }

  if (addonAgents !== undefined) {
    if (!Array.isArray(addonAgents)) {
      return NextResponse.json(
        { error: "addonAgents debe ser un arreglo." },
        { status: 400 }
      );
    }
    const validAddons = ["metra", "nomethes", "hermes", "logistes"];
    const invalid = addonAgents.filter((a) => !validAddons.includes(a));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Add-ons inválidos: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    updateData.addonAgents = addonAgents;
  }

  if (adminNotes !== undefined) {
    updateData.adminNotes = adminNotes;
  }

  if (planId !== undefined) {
    const validPlans = ["pro", "elite"];
    if (planId !== null && !validPlans.includes(planId)) {
      return NextResponse.json(
        { error: "Plan inválido. Debe ser 'pro', 'elite' o vacío." },
        { status: 400 }
      );
    }
    updateData.planId = planId || null;
  }

  // If we're canceling, try to stop ePayco recurring billing too. The onpage
  // checkout flow may not have stored an epaycoSubscriptionId — in that case
  // there's no recurring subscription object to cancel (charges are one-off),
  // so we just update local state and report that to the admin.
  let epaycoCancel: { attempted: boolean; ok: boolean; note: string } = {
    attempted: false,
    ok: false,
    note: "",
  };
  if (
    status === "canceled" &&
    existing.status !== "canceled"
  ) {
    if (existing.epaycoSubscriptionId) {
      epaycoCancel.attempted = true;
      try {
        const { cancelSubscription } = await import("@/lib/epayco");
        const res = await cancelSubscription(existing.epaycoSubscriptionId);
        epaycoCancel.ok = res?.success !== false;
        epaycoCancel.note = epaycoCancel.ok
          ? "Suscripción cancelada en ePayco."
          : "ePayco rechazó la cancelación; revisa el panel de ePayco.";
      } catch (e) {
        epaycoCancel.note = `Error al cancelar en ePayco: ${e instanceof Error ? e.message : "desconocido"}. Cancela manualmente en el panel de ePayco.`;
      }
    } else {
      epaycoCancel.note =
        "No hay subscription id de ePayco guardado (checkout onpage). Si el cobro es recurrente, cancélalo manualmente en el panel de ePayco.";
    }
  }

  const updated = await db.subscription.update({
    where: { id },
    data: updateData,
  });

  // Log each distinct change separately
  const logPromises: Promise<void>[] = [];

  if (epaycoCancel.attempted || epaycoCancel.note) {
    logPromises.push(
      logAdminAction({
        adminId: admin.userId,
        action: "subscription.epayco_cancel",
        targetType: "subscription",
        targetId: id,
        metadata: { ...epaycoCancel },
      })
    );
  }

  if (status !== undefined && status !== existing.status) {
    logPromises.push(
      logAdminAction({
        adminId: admin.userId,
        action: "subscription.status_change",
        targetType: "subscription",
        targetId: id,
        metadata: { from: existing.status, to: status },
      })
    );
  }

  if (addonAgents !== undefined) {
    const before = existing.addonAgents;
    const after = addonAgents;
    const added = after.filter((a) => !before.includes(a));
    const removed = before.filter((a) => !after.includes(a));
    if (added.length > 0 || removed.length > 0) {
      logPromises.push(
        logAdminAction({
          adminId: admin.userId,
          action: "subscription.addons_change",
          targetType: "subscription",
          targetId: id,
          metadata: { before, after, added, removed },
        })
      );
    }
  }

  if (adminNotes !== undefined && adminNotes !== existing.adminNotes) {
    logPromises.push(
      logAdminAction({
        adminId: admin.userId,
        action: "subscription.notes_update",
        targetType: "subscription",
        targetId: id,
        metadata: { hasNote: !!adminNotes },
      })
    );
  }

  if (planId !== undefined && planId !== existing.planId) {
    logPromises.push(
      logAdminAction({
        adminId: admin.userId,
        action: "subscription.plan_change",
        targetType: "subscription",
        targetId: id,
        metadata: { from: existing.planId, to: planId },
      })
    );
  }

  await Promise.all(logPromises);

  return NextResponse.json({
    subscription: updated,
    ...(epaycoCancel.note ? { epaycoCancel } : {}),
  });
}
