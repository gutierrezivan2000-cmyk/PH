import {
  INCLUDED_AGENT_IDS,
  isIncludedAgent,
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
    if (!isIncludedAgent(id) && addons.includes(id) && !result.includes(id)) {
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
  return (sub?.addonAgents || []).includes(agentId);
}
