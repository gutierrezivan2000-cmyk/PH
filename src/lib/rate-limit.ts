import { db } from "@/lib/db";
import type { NextRequest } from "next/server";

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Fixed-window rate limiter backed by the RateLimit table. Not perfectly
 * atomic (a burst can slip a couple over the limit), but that's fine — it's a
 * mitigation against email bombing / brute force, not a hard guarantee.
 * Fails OPEN on any DB error so an infra blip never locks out real users.
 */
export async function rateLimit(
  key: string,
  opts: { max: number; windowMs: number }
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const now = Date.now();
  try {
    const existing = await db.rateLimit.findUnique({ where: { key } });

    // No record, or the previous window has fully elapsed → start fresh.
    if (!existing || existing.windowStart.getTime() <= now - opts.windowMs) {
      await db.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, windowStart: new Date(now) },
        update: { count: 1, windowStart: new Date(now) },
      });
      return { allowed: true };
    }

    if (existing.count >= opts.max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((existing.windowStart.getTime() + opts.windowMs - now) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }

    await db.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return { allowed: true };
  } catch (e) {
    console.error("[rateLimit] failing open:", e);
    return { allowed: true };
  }
}
