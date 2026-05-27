import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export interface AdminSession {
  userId: string;
  email: string;
  name: string | null;
  role: "admin";
}

/**
 * Whether an email is a permanent (env-configured) admin. These accounts are
 * always promoted to admin on login and CANNOT be demoted from the UI — they
 * are the platform owners. UI-promoted admins (not in ADMIN_EMAILS) can be
 * demoted normally.
 */
export function isEnvAdmin(email?: string | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/**
 * Resolves the current session and returns it if the user is an admin.
 * Returns null otherwise. Use in server components / API routes.
 */
export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;

  // Double-check the role from DB (don't trust JWT alone for sensitive ops)
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user || user.role !== "admin") return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: "admin",
  };
}

/**
 * Helper for API routes — returns admin session OR a 401/403 NextResponse.
 */
export async function requireAdminOr401(): Promise<
  { admin: AdminSession } | { error: NextResponse }
> {
  const admin = await requireAdmin();
  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "Acceso denegado. Solo administradores." },
        { status: 403 }
      ),
    };
  }
  return { admin };
}

/**
 * Record an admin action in the audit log.
 */
export async function logAdminAction(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string | null;
}) {
  try {
    await db.adminAuditLog.create({
      data: {
        adminId: params.adminId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        metadata: params.metadata as never,
        ipAddress: params.ipAddress || null,
      },
    });
  } catch (e) {
    console.error("[admin-auth] Failed to log action:", e);
  }
}
