import {
  INCLUDED_AGENT_IDS,
  isIncludedAgent,
  isComingSoonAgent,
  AGENT_IDS,
  type AgentId,
} from "@/lib/agents";

export type CanonicalPlan = "pro" | "elite";

/**
 * Normalizes any plan identifier we've ever stored into the canonical
 * "pro" | "elite" used across admin metrics, usage limits, and UI.
 *
 * Handles all historical variants:
 *  - canonical: "pro", "elite"
 *  - ePayco idPlan: "plan-profesional-ph", "plan-elite-ph"
 *  - anything containing "elite" / "profesional"
 * Returns null for unknown values (e.g. invoice strings like "ph-abc-123").
 */
export function normalizePlanId(raw?: string | null): CanonicalPlan | null {
  if (!raw) return null;
  const v = String(raw).toLowerCase().trim();
  if (v === "elite" || v === "plan-elite-ph" || v.includes("elite")) return "elite";
  if (v === "pro" || v === "plan-profesional-ph" || v.includes("profesional") || v === "pro-ph")
    return "pro";
  return null;
}

/**
 * Fallback plan detection from the charged amount (USD).
 * Elite is $200, Pro is $20 — anything >= $100 is Elite.
 */
export function planFromAmount(amount?: number | string | null): CanonicalPlan | null {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!n || Number.isNaN(n)) return null;
  return n >= 100 ? "elite" : "pro";
}

/** Monthly base price (USD) of a plan. Unknown/null plans contribute $0. */
export function planBaseMrr(planId?: string | null): number {
  const p = normalizePlanId(planId);
  if (p === "elite") return 200;
  if (p === "pro") return 20;
  return 0;
}

/** Full monthly recurring revenue for a subscription: base plan + $5/add-on. */
export function calcMrr(planId?: string | null, addonAgents?: string[] | null): number {
  return planBaseMrr(planId) + (addonAgents?.length || 0) * 5;
}

// ── Subscription access (trial + paid gating) ────────────────────────────────

export const TRIAL_DAYS = 7;

export interface AccessCheck {
  allowed: boolean;
  /** Machine-readable: "active" | "trialing" | "trial_expired" | "past_due" | "canceled" | "inactive" | "none" */
  status: string;
  /** Human-readable Spanish reason when blocked. */
  reason?: string;
  trialEndsAt?: Date | null;
}

interface AccessSubLike {
  status?: string | null;
  currentPeriodEnd?: Date | null;
}

/**
 * Source of truth for "can this user use paid features".
 * - "active": allowed. (We don't hard-expire by date yet because the ePayco
 *   onpage flow has no recurring billing reconciliation; expiring would lock
 *   out paying customers. Revisit when recurring billing lands.)
 * - "trialing": allowed only while currentPeriodEnd is in the future.
 * - everything else (canceled, past_due, inactive, missing): blocked.
 */
export function hasActiveAccess(sub?: AccessSubLike | null): AccessCheck {
  if (!sub || !sub.status) {
    return {
      allowed: false,
      status: "none",
      reason: "Necesitas una suscripción activa para usar SOPH.IA.",
    };
  }
  if (sub.status === "active") {
    return { allowed: true, status: "active" };
  }
  if (sub.status === "trialing") {
    const ends = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    if (ends && ends.getTime() > Date.now()) {
      return { allowed: true, status: "trialing", trialEndsAt: ends };
    }
    return {
      allowed: false,
      status: "trial_expired",
      trialEndsAt: ends,
      reason:
        "Tu período de prueba de 7 días terminó. Elige un plan en Suscripción para seguir generando documentos.",
    };
  }
  if (sub.status === "past_due") {
    return {
      allowed: false,
      status: "past_due",
      reason:
        "Tu último pago no se pudo procesar. Actualiza tu método de pago en Suscripción para reactivar tu cuenta.",
    };
  }
  if (sub.status === "canceled") {
    return {
      allowed: false,
      status: "canceled",
      reason:
        "Tu suscripción está cancelada. Reactívala desde Suscripción para seguir usando SOPH.IA.",
    };
  }
  return {
    allowed: false,
    status: sub.status,
    reason: "Tu suscripción no está activa. Revisa tu plan en Suscripción.",
  };
}

interface SubLike {
  status?: string | null;
  planId?: string | null;
  addonAgents?: string[] | null;
}

/**
 * The set of agents a user can actually access.
 * Included agents (Themis, Chronos) are always available; add-on agents
 * require being present in subscription.addonAgents (set by admin/billing).
 */
export function accessibleAgents(sub?: SubLike | null): AgentId[] {
  const addons = sub?.addonAgents || [];
  const result: AgentId[] = [...INCLUDED_AGENT_IDS];
  for (const id of AGENT_IDS) {
    if (
      !isIncludedAgent(id) &&
      !isComingSoonAgent(id) &&
      addons.includes(id) &&
      !result.includes(id)
    ) {
      result.push(id);
    }
  }
  return result;
}

/**
 * Whether a specific agent is accessible to a user given their subscription.
 * Server-side source of truth — enforce this in the agent chat API.
 */
export function canAccessAgent(agentId: AgentId, sub?: SubLike | null): boolean {
  if (isIncludedAgent(agentId)) return true;
  // Coming-soon agents are visible in the catalog but not usable by anyone,
  // regardless of purchased add-ons.
  if (isComingSoonAgent(agentId)) return false;
  return (sub?.addonAgents || []).includes(agentId);
}
