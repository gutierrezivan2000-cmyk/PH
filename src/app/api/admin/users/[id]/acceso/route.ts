export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { finDeAcceso, validarAcceso } from "@/lib/admin/acceso";

/**
 * Da acceso a un plan por un número de días (crea la suscripción si no existe o la reactiva).
 * No toca ePayco ni cobra: es una cortesía del administrador y queda en la auditoría.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;
  const { admin } = r;
  const { id } = await params;

  const v = validarAcceso(await req.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { planId, dias } = v.acceso;

  const usuario = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!usuario) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const antes = await db.subscription.findUnique({ where: { userId: id }, select: { planId: true, status: true, currentPeriodEnd: true } });
  const ahora = new Date();
  const datos = { planId, status: "active", currentPeriodStart: ahora, currentPeriodEnd: finDeAcceso(ahora, dias) };
  const sub = await db.subscription.upsert({
    where: { userId: id },
    create: { userId: id, ...datos },
    update: datos,
    select: { id: true, planId: true, status: true, currentPeriodEnd: true },
  });

  await logAdminAction({
    adminId: admin.userId,
    action: "user.grant_access",
    targetType: "user",
    targetId: id,
    metadata: { planId, dias, from: antes ? { planId: antes.planId, status: antes.status } : null },
  });

  return NextResponse.json({ subscription: sub });
}
