// Subsystem health checks — shared by /api/health and the scheduled health
// cron. The whole point: turn SILENT failures loud. A retired AI model or a
// missing CRON_SECRET should show up here (and trigger an alert), instead of
// looking like "no hay datos todavía".

export type HealthStatus = "ok" | "warn" | "fail";

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  detail: string;
  /** true when this check gates a paid/core feature and is in a failing state. */
  critical?: boolean;
  ms?: number;
}

export interface HealthReport {
  ok: boolean;
  /** true when at least one CRITICAL subsystem is failing (alert-worthy). */
  criticalFail: boolean;
  checks: HealthCheck[];
  timestamp: string;
}

function envSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Run health checks. `deep` performs a real (tiny, paid) AI round-trip and a
 * DB query; otherwise only config presence is inspected. `now` is injected so
 * the report timestamp stays deterministic for callers that need it.
 */
export async function runHealthChecks(opts: {
  deep: boolean;
  now: Date;
}): Promise<HealthReport> {
  const { deep, now } = opts;
  const checks: HealthCheck[] = [];
  const IS_DEMO = process.env.DEMO_MODE === "true";

  // ── Auth (critical) ────────────────────────────────────────────
  checks.push(
    envSet("AUTH_SECRET")
      ? { name: "auth", status: "ok", detail: "AUTH_SECRET configurado" }
      : { name: "auth", status: "fail", critical: true, detail: "AUTH_SECRET ausente — el login no funcionará" }
  );

  // ── Database (critical) ────────────────────────────────────────
  if (!envSet("DATABASE_URL")) {
    checks.push({ name: "database", status: "fail", critical: true, detail: "DATABASE_URL ausente" });
  } else if (deep && !IS_DEMO) {
    const t = Date.now();
    try {
      const { db } = await import("@/lib/db");
      const users = await db.user.count();
      checks.push({ name: "database", status: "ok", detail: `Conectada (${users} usuarios)`, ms: Date.now() - t });
    } catch (e) {
      checks.push({
        name: "database",
        status: "fail",
        critical: true,
        detail: `Consulta falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200),
        ms: Date.now() - t,
      });
    }
  } else {
    checks.push({ name: "database", status: "ok", detail: "DATABASE_URL configurada (sin sondeo)" });
  }

  // ── AI (critical) — the exact class of silent failure we just fixed ──
  const modelId = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  if (!envSet("ANTHROPIC_API_KEY")) {
    checks.push({ name: "ai", status: "fail", critical: true, detail: "ANTHROPIC_API_KEY ausente — generación y redactores IA no funcionarán" });
  } else if (deep && !IS_DEMO) {
    const t = Date.now();
    try {
      const { generateWithClaude } = await import("@/lib/ai-client");
      const res = await generateWithClaude("Responde en una sola linea.", "Di 'ok' y nada mas.");
      const text = (res.text || "").toLowerCase();
      if (text.includes("ok")) {
        checks.push({ name: "ai", status: "ok", detail: `Modelo ${modelId} respondió (${res.tokensUsed} tokens)`, ms: Date.now() - t });
      } else {
        checks.push({ name: "ai", status: "warn", detail: `Modelo ${modelId} respondió pero con salida inesperada`, ms: Date.now() - t });
      }
    } catch (e) {
      checks.push({
        name: "ai",
        status: "fail",
        critical: true,
        detail: `Llamada a ${modelId} falló: ${e instanceof Error ? e.message : String(e)}`.slice(0, 220),
        ms: Date.now() - t,
      });
    }
  } else {
    checks.push({ name: "ai", status: "ok", detail: `ANTHROPIC_API_KEY configurada · modelo ${modelId} (sin sondeo)` });
  }

  // ── Email (warn if unconfigured — comunicados/cartas quedan deshabilitados) ──
  checks.push(
    envSet("RESEND_API_KEY")
      ? { name: "email", status: "ok", detail: "RESEND_API_KEY configurada" }
      : { name: "email", status: "warn", detail: "RESEND_API_KEY ausente — comunicados, cartas de cobro por correo y verificación de cuenta no se enviarán" }
  );

  // ── Blob (warn if unconfigured — subida de archivos deshabilitada) ──
  checks.push(
    envSet("BLOB_READ_WRITE_TOKEN")
      ? { name: "blob", status: "ok", detail: "BLOB_READ_WRITE_TOKEN configurado" }
      : { name: "blob", status: "warn", detail: "BLOB_READ_WRITE_TOKEN ausente — la subida de documentos y salidas generadas fallará" }
  );

  // ── Payments (warn if unconfigured — cobros deshabilitados) ──
  const epaycoVars = ["EPAYCO_PUBLIC_KEY", "EPAYCO_PRIVATE_KEY", "EPAYCO_P_KEY", "EPAYCO_P_CUST_ID"];
  const missingEpayco = epaycoVars.filter((v) => !envSet(v));
  checks.push(
    missingEpayco.length === 0
      ? { name: "payments", status: "ok", detail: "ePayco configurado" }
      : { name: "payments", status: "warn", detail: `ePayco incompleto — faltan: ${missingEpayco.join(", ")}. Los pagos de suscripción fallarán` }
  );

  // ── Cron (warn — batch Élite se deshabilita en silencio sin CRON_SECRET) ──
  checks.push(
    envSet("CRON_SECRET")
      ? { name: "cron", status: "ok", detail: "CRON_SECRET configurado — la cola de generación en lote puede drenarse" }
      : { name: "cron", status: "warn", detail: "CRON_SECRET ausente — el cron responde 401 y la generación en lote (Élite) NUNCA se procesa, en silencio" }
  );

  const criticalFail = checks.some((c) => c.status === "fail" && c.critical);
  const ok = checks.every((c) => c.status === "ok");

  return { ok, criticalFail, checks, timestamp: now.toISOString() };
}
