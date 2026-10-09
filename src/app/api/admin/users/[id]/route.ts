export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction, isEnvAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { codigoDeUsuario } from "@/lib/admin/anonimo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { id } = await params;

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [user, recentGenerations, recentTickets, generations30d, agentChatCount] =
    await Promise.all([
      db.user.findUnique({
        where: { id },
        select: {
          id: true,
          role: true,
          banned: true,
          bannedAt: true,
          banReason: true,
          createdAt: true,
          onboarded: true,
          subscription: { select: { id: true, planId: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, addonAgents: true } },
          accounts: { select: { provider: true } },
          _count: {
            select: {
              properties: true,
              generations: true,
              tickets: true,
              agentChats: true,
            },
          },
        },
      }),
      db.generation.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, type: true, createdAt: true },
      }),
      db.ticket.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, subject: true, status: true, createdAt: true },
      }),
      db.generation.count({
        where: { userId: id, createdAt: { gte: last30 } },
      }),
      db.agentChat.count({ where: { userId: id } }),
    ]);

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    user: { ...user, codigo: codigoDeUsuario(user.id) },
    recentGenerations,
    recentTickets,
    generations30d,
    agentChatCount,
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

  const body = await req.json().catch(() => ({}));
  const { role, banned, reason } = body as {
    role?: string;
    banned?: boolean;
    reason?: string;
  };

  const existing = await db.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, banned: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // ── Ban / unban ─────────────────────────────────────────────
  if (typeof banned === "boolean") {
    if (id === admin.userId) {
      return NextResponse.json(
        { error: "No puedes banearte a ti mismo." },
        { status: 400 }
      );
    }
    // Bloquear a otro admin también es cosa de propietarios.
    if (banned && existing.role === "admin" && !isEnvAdmin(admin.email)) {
      return NextResponse.json({ error: "Solo los propietarios pueden bloquear a un administrador." }, { status: 403 });
    }
    // Permanent admins (ADMIN_EMAILS) would be able to log in regardless — block.
    if (banned && isEnvAdmin(existing.email)) {
      return NextResponse.json(
        {
          error:
            "No puedes banear a un administrador permanente (configurado en ADMIN_EMAILS).",
        },
        { status: 400 }
      );
    }

    const updated = await db.user.update({
      where: { id },
      data: {
        banned,
        bannedAt: banned ? new Date() : null,
        banReason: banned ? (reason?.trim() || null) : null,
      },
      select: { id: true, role: true, banned: true, banReason: true },
    });

    await logAdminAction({
      adminId: admin.userId,
      action: banned ? "user.ban" : "user.unban",
      targetType: "user",
      targetId: id,
      metadata: banned ? { reason: reason?.trim() || null } : {},
    });

    return NextResponse.json({ user: updated });
  }

  // ── Role change ─────────────────────────────────────────────
  // Solo los propietarios (cuentas fijas / ADMIN_EMAILS) vuelven admin o quitan el rol: un admin
  // común no puede escalar privilegios ni degradar a otros.
  if (!isEnvAdmin(admin.email)) {
    return NextResponse.json(
      { error: "Solo los propietarios de la plataforma pueden cambiar roles." },
      { status: 403 }
    );
  }
  if (id === admin.userId) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol." },
      { status: 400 }
    );
  }

  if (!role || !["admin", "user"].includes(role)) {
    return NextResponse.json(
      { error: "Rol inválido. Debe ser 'admin' o 'user'." },
      { status: 400 }
    );
  }

  // Env-configured admins (ADMIN_EMAILS) are permanent — a demotion here would
  // be silently reverted on their next login, so reject it with a clear message.
  if (role === "user" && isEnvAdmin(existing.email)) {
    return NextResponse.json(
      {
        error:
          "Este usuario es administrador permanente (configurado en ADMIN_EMAILS). Quítalo de esa variable de entorno para poder degradarlo.",
      },
      { status: 400 }
    );
  }

  const updated = await db.user.update({
    where: { id },
    data: { role },
    select: { id: true, role: true },
  });

  await logAdminAction({
    adminId: admin.userId,
    action: "user.role_change",
    targetType: "user",
    targetId: id,
    metadata: { from: existing.role, to: role },
  });

  return NextResponse.json({ user: updated });
}
