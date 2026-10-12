export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction, isEnvAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { CAMPOS_DE_IDENTIDAD, CAMPOS_DE_NOMBRE, codigoDeUsuario } from "@/lib/admin/identidad";
import { MENSAJE_AUTOCONCESION, autoconcesionBloqueada, marcaDeCambioPropio } from "@/lib/admin/autoconcesion";
import { PLANS } from "@/lib/epayco";

/** Planes que se pueden asignar: los mismos que existen en PLANS (pro, business y elite), no una lista aparte que se desfase. */
const PLANES_VALIDOS: string[] = Object.keys(PLANS);

/** Largo máximo de la nota interna de una suscripción. */
const MAX_NOTA_ADMIN = 2000;

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
          select: CAMPOS_DE_IDENTIDAD,
        },
      },
    }),
    db.adminAuditLog.findMany({
      where: { targetType: "subscription", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, metadata: true, createdAt: true, adminId: true, admin: { select: CAMPOS_DE_NOMBRE } },
    }),
  ]);

  if (!subscription) {
    return NextResponse.json(
      { error: "Suscripción no encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    subscription: { ...subscription, user: { ...subscription.user, codigo: codigoDeUsuario(subscription.user.id) } },
    auditLogs: auditLogs.map((l) => ({ ...l, admin: { ...l.admin, codigo: codigoDeUsuario(l.adminId) } })),
  });
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

  // Un administrador no se cambia su propia suscripción (plan, estado ni add-ons); los propietarios sí, para probar planes.
  if (autoconcesionBloqueada(admin.userId, existing.userId, isEnvAdmin(admin.email))) {
    return NextResponse.json({ error: MENSAJE_AUTOCONCESION }, { status: 403 });
  }
  const propio = marcaDeCambioPropio(admin.userId, existing.userId);

  const crudo = await req.json().catch(() => null);
  const body = crudo && typeof crudo === "object" && !Array.isArray(crudo) ? crudo : {};
  // Lista blanca: solo estos cuatro campos llegan a la base; cualquier otro del cuerpo se ignora.
  const {
    status,
    addonAgents: addonsPedidos,
    adminNotes,
    planId,
  } = body as {
    status?: string;
    addonAgents?: string[];
    adminNotes?: unknown;
    planId?: unknown;
  };
  let addonAgents: string[] | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  if (status !== undefined) {
    const validStatuses = ["active", "trialing", "inactive", "canceled", "past_due"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Estado inválido." },
        { status: 400 }
      );
    }
    updateData.status = status;
  }

  if (addonsPedidos !== undefined) {
    if (!Array.isArray(addonsPedidos)) {
      return NextResponse.json(
        { error: "addonAgents debe ser un arreglo." },
        { status: 400 }
      );
    }
    const validAddons = ["metra", "nomethes", "hermes", "logistes"];
    const invalid = addonsPedidos.filter((a) => !validAddons.includes(a));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Add-ons inválidos: ${invalid.map(String).join(", ")}` },
        { status: 400 }
      );
    }
    // Sin repetidos: un add-on duplicado se contaría dos veces en el MRR.
    addonAgents = [...new Set(addonsPedidos)];
    updateData.addonAgents = addonAgents;
  }

  if (adminNotes !== undefined) {
    if (adminNotes !== null && typeof adminNotes !== "string") {
      return NextResponse.json({ error: "adminNotes debe ser texto." }, { status: 400 });
    }
    if (typeof adminNotes === "string" && adminNotes.length > MAX_NOTA_ADMIN) {
      return NextResponse.json({ error: `La nota no puede pasar de ${MAX_NOTA_ADMIN} caracteres.` }, { status: 400 });
    }
    updateData.adminNotes = adminNotes;
  }

  // `planId: null` quita el plan (queda sin plan asignado); el texto vacío NO vale como "quitar": así un formulario con el
  // selector sin elegir no borra el plan por accidente. Antes la lista omitía "business", que existe y se ofrece al dar acceso.
  let planNuevo: string | null | undefined;
  if (planId !== undefined) {
    if (planId !== null && (typeof planId !== "string" || !PLANES_VALIDOS.includes(planId))) {
      return NextResponse.json(
        { error: `Plan inválido. Debe ser ${PLANES_VALIDOS.map((p) => `'${p}'`).join(", ")} o null para quitar el plan.` },
        { status: 400 }
      );
    }
    planNuevo = planId;
    updateData.planId = planId;
  }

  // If we're canceling, try to stop ePayco recurring billing too. The onpage
  // checkout flow may not have stored an epaycoSubscriptionId — in that case
  // there's no recurring subscription object to cancel (charges are one-off),
  // so we just update local state and report that to the admin.
  const epaycoCancel: { attempted: boolean; ok: boolean; note: string } = {
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
        metadata: { ...epaycoCancel, ...propio },
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
        metadata: { from: existing.status, to: status, ...propio },
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
          metadata: { before, after, added, removed, ...propio },
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
        metadata: { hasNote: !!adminNotes, ...propio },
      })
    );
  }

  if (planNuevo !== undefined && planNuevo !== existing.planId) {
    logPromises.push(
      logAdminAction({
        adminId: admin.userId,
        action: "subscription.plan_change",
        targetType: "subscription",
        targetId: id,
        metadata: { from: existing.planId, to: planNuevo, ...propio },
      })
    );
  }

  await Promise.all(logPromises);

  return NextResponse.json({
    subscription: updated,
    ...(epaycoCancel.note ? { epaycoCancel } : {}),
  });
}
