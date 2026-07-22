import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHealthChecks, type HealthReport } from "./health";

const NOW = new Date(2026, 6, 22);

// Env vars health.ts reads. We snapshot and restore around each test.
const KEYS = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "RESEND_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "EPAYCO_PUBLIC_KEY",
  "EPAYCO_PRIVATE_KEY",
  "EPAYCO_P_KEY",
  "EPAYCO_P_CUST_ID",
  "CRON_SECRET",
  "DEMO_MODE",
];

let snapshot: Record<string, string | undefined>;

function setAll() {
  process.env.AUTH_SECRET = "x";
  process.env.DATABASE_URL = "postgres://x";
  process.env.ANTHROPIC_API_KEY = "sk-x";
  process.env.RESEND_API_KEY = "re_x";
  process.env.BLOB_READ_WRITE_TOKEN = "blob_x";
  process.env.EPAYCO_PUBLIC_KEY = "x";
  process.env.EPAYCO_PRIVATE_KEY = "x";
  process.env.EPAYCO_P_KEY = "x";
  process.env.EPAYCO_P_CUST_ID = "x";
  process.env.CRON_SECRET = "x";
  delete process.env.DEMO_MODE;
  delete process.env.ANTHROPIC_MODEL;
}

const byName = (r: HealthReport, name: string) => r.checks.find((c) => c.name === name)!;

beforeEach(() => {
  snapshot = {};
  for (const k of KEYS) snapshot[k] = process.env[k];
});
afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("runHealthChecks (shallow)", () => {
  it("all env present → everything ok, no critical fail", async () => {
    setAll();
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.criticalFail).toBe(false);
    expect(r.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("missing ANTHROPIC_API_KEY → ai fail + critical", async () => {
    setAll();
    delete process.env.ANTHROPIC_API_KEY;
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r, "ai").status).toBe("fail");
    expect(byName(r, "ai").critical).toBe(true);
    expect(r.criticalFail).toBe(true);
    expect(r.ok).toBe(false);
  });

  it("missing AUTH_SECRET → auth fail + critical", async () => {
    setAll();
    delete process.env.AUTH_SECRET;
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r, "auth").status).toBe("fail");
    expect(r.criticalFail).toBe(true);
  });

  it("missing CRON_SECRET → cron warn (not critical)", async () => {
    setAll();
    delete process.env.CRON_SECRET;
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r, "cron").status).toBe("warn");
    expect(r.criticalFail).toBe(false);
    expect(r.ok).toBe(false); // a warn still means "not fully ok"
  });

  it("missing RESEND_API_KEY → email warn", async () => {
    setAll();
    delete process.env.RESEND_API_KEY;
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r, "email").status).toBe("warn");
    expect(r.criticalFail).toBe(false);
  });

  it("partial ePayco config → payments warn listing the missing keys", async () => {
    setAll();
    delete process.env.EPAYCO_P_KEY;
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r, "payments").status).toBe("warn");
    expect(byName(r, "payments").detail).toContain("EPAYCO_P_KEY");
  });

  it("reports the effective model id and defaults to claude-sonnet-5", async () => {
    setAll();
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r, "ai").detail).toContain("claude-sonnet-5");
    process.env.ANTHROPIC_MODEL = "claude-opus-4-8";
    const r2 = await runHealthChecks({ deep: false, now: NOW });
    expect(byName(r2, "ai").detail).toContain("claude-opus-4-8");
  });

  it("carries the injected timestamp", async () => {
    setAll();
    const r = await runHealthChecks({ deep: false, now: NOW });
    expect(r.timestamp).toBe(NOW.toISOString());
  });
});
