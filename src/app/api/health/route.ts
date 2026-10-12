export const runtime = "nodejs";
export const maxDuration = 60;

import { secretoCoincide } from "@/lib/secreto";
import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";

/**
 * Health of every critical subsystem. Admin-only (session or the migrate
 * secret) since ?deep=1 triggers a small paid AI round-trip and a DB query.
 * Without ?deep it only inspects config presence — cheap and safe to poll.
 */
export async function GET(req: NextRequest) {
  if (!secretoCoincide(req.headers.get("x-admin-secret"), process.env.ADMIN_MIGRATE_SECRET)) {
    const { requireAdmin } = await import("@/lib/admin-auth");
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
  }

  const deep = req.nextUrl.searchParams.get("deep") === "1";
  const report = await runHealthChecks({ deep, now: new Date() });

  // 200 when nothing critical is down (warnings are still 200), 503 otherwise.
  return NextResponse.json(report, { status: report.criticalFail ? 503 : 200 });
}
