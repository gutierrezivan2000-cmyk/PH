export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";

/**
 * Scheduled deep health check (every 6h). Runs the full probe — including the
 * AI round-trip that would have caught the retired-model / deprecated-param
 * outage — and emails the admins (ADMIN_EMAILS) whenever a CRITICAL subsystem
 * is down. This is what makes silent failures loud.
 *
 * Guarded by CRON_SECRET like the batch cron. Note: if CRON_SECRET itself is
 * missing this route can't run — but runHealthChecks flags that separately, and
 * the /api/health endpoint still works for manual checks.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const report = await runHealthChecks({ deep: true, now: new Date() });

  let alerted = 0;
  if (report.criticalFail) {
    const failing = report.checks
      .filter((c) => c.status === "fail" && c.critical)
      .map((c) => ({ name: c.name, detail: c.detail }));
    console.error("[cron/health-check] CRITICAL subsystems down:", failing);
    try {
      const { sendHealthAlertEmail } = await import("@/lib/email");
      const r = await sendHealthAlertEmail(failing);
      alerted = r.sent;
    } catch (e) {
      console.error("[cron/health-check] alert send failed:", e);
    }
  }

  return NextResponse.json({
    ok: report.ok,
    criticalFail: report.criticalFail,
    alerted,
    checks: report.checks.map((c) => ({ name: c.name, status: c.status })),
  });
}
