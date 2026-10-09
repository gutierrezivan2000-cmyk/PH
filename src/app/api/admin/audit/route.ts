export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAdminOr401 } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { CAMPOS_DE_NOMBRE, codigoDeUsuario } from "@/lib/admin/identidad";

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  const r = await requireAdminOr401();
  if ("error" in r) return r.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const adminId = searchParams.get("adminId") || "";
  const targetType = searchParams.get("targetType") || "all";
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (q) {
    where.action = { contains: q, mode: "insensitive" };
  }

  if (adminId) {
    where.adminId = adminId;
  }

  if (targetType !== "all") {
    where.targetType = targetType;
  }

  if (from || to) {
    where.createdAt = {};
    if (from) {
      where.createdAt.gte = new Date(from);
    }
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  const [logs, total, admins] = await Promise.all([
    db.adminAuditLog.findMany({
      where,
      include: {
        admin: {
          select: CAMPOS_DE_NOMBRE,
        },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.adminAuditLog.count({ where }),
    // Return all admins for filter dropdown
    db.user.findMany({
      where: { role: "admin" },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    logs: logs.map((l) => ({ ...l, admin: { ...l.admin, codigo: codigoDeUsuario(l.admin.id) } })),
    total,
    page,
    pageSize: PAGE_SIZE,
    admins: admins.map((a) => ({ ...a, codigo: codigoDeUsuario(a.id) })),
  });
}
