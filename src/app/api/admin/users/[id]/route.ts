export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401, logAdminAction, isEnvAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

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
        include: {
          subscription: true,
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
        include: { property: { select: { name: true } } },
      }),
      db.ticket.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
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
    user,
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
      select: { id: true, email: true, role: true, banned: true, banReason: true },
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
    select: { id: true, email: true, role: true },
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
