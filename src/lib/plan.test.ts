import { describe, it, expect } from "vitest";
import {
  normalizePlanId,
  planFromAmount,
  planBaseMrr,
  calcMrr,
  hasActiveAccess,
  canAccessAgent,
  accessibleAgents,
  GRACE_DAYS,
} from "./plan";

const DAY = 24 * 60 * 60 * 1000;

describe("normalizePlanId", () => {
  it("maps canonical + ePayco idPlan variants", () => {
    expect(normalizePlanId("pro")).toBe("pro");
    expect(normalizePlanId("plan-pro-ph")).toBe("pro");
    expect(normalizePlanId("plan-profesional-ph")).toBe("pro"); // legacy
    expect(normalizePlanId("business")).toBe("business");
    expect(normalizePlanId("plan-business-ph")).toBe("business");
    expect(normalizePlanId("elite")).toBe("elite");
    expect(normalizePlanId("plan-elite-ph")).toBe("elite");
  });

  it("elite/business win over the generic 'pro' substring match", () => {
    expect(normalizePlanId("ELITE")).toBe("elite");
    expect(normalizePlanId("something-business")).toBe("business");
  });

  it("returns null for unknown / empty", () => {
    expect(normalizePlanId(null)).toBeNull();
    expect(normalizePlanId(undefined)).toBeNull();
    expect(normalizePlanId("ph-invoice-abc123")).toBeNull();
  });
});

describe("planFromAmount (COP thresholds)", () => {
  it("classifies by charged COP amount", () => {
    expect(planFromAmount(99900)).toBe("pro");
    expect(planFromAmount(299900)).toBe("business");
    expect(planFromAmount(749900)).toBe("elite");
    expect(planFromAmount("299900.00")).toBe("business");
  });
  it("null on non-numeric", () => {
    expect(planFromAmount(null)).toBeNull();
    expect(planFromAmount("abc")).toBeNull();
  });
});

describe("MRR", () => {
  it("planBaseMrr in USD-equivalent", () => {
    expect(planBaseMrr("pro")).toBe(24);
    expect(planBaseMrr("business")).toBe(73);
    expect(planBaseMrr("elite")).toBe(183);
    expect(planBaseMrr(null)).toBe(0);
  });
  it("calcMrr adds $5 per add-on", () => {
    expect(calcMrr("pro", [])).toBe(24);
    expect(calcMrr("pro", ["metra", "hermes"])).toBe(34);
    expect(calcMrr("elite", ["metra"])).toBe(188);
    expect(calcMrr(null, ["metra"])).toBe(5);
  });
});

describe("hasActiveAccess", () => {
  it("blocks when no subscription", () => {
    expect(hasActiveAccess(null).allowed).toBe(false);
    expect(hasActiveAccess(null).status).toBe("none");
  });

  it("active within paid period → allowed", () => {
    const r = hasActiveAccess({ status: "active", currentPeriodEnd: new Date(Date.now() + 10 * DAY) });
    expect(r.allowed).toBe(true);
    expect(r.status).toBe("active");
  });

  it("legacy active with no period date never expires", () => {
    const r = hasActiveAccess({ status: "active", currentPeriodEnd: null });
    expect(r.allowed).toBe(true);
    expect(r.status).toBe("active");
  });

  it("just past period but within grace → allowed as grace", () => {
    const r = hasActiveAccess({ status: "active", currentPeriodEnd: new Date(Date.now() - 2 * DAY) });
    expect(r.allowed).toBe(true);
    expect(r.status).toBe("grace");
  });

  it("past the grace window → blocked as expired", () => {
    const r = hasActiveAccess({ status: "active", currentPeriodEnd: new Date(Date.now() - (GRACE_DAYS + 2) * DAY) });
    expect(r.allowed).toBe(false);
    expect(r.status).toBe("expired");
  });

  it("trialing honors the end date", () => {
    expect(hasActiveAccess({ status: "trialing", currentPeriodEnd: new Date(Date.now() + DAY) }).allowed).toBe(true);
    const expired = hasActiveAccess({ status: "trialing", currentPeriodEnd: new Date(Date.now() - DAY) });
    expect(expired.allowed).toBe(false);
    expect(expired.status).toBe("trial_expired");
  });

  it("past_due / canceled are blocked", () => {
    expect(hasActiveAccess({ status: "past_due" }).allowed).toBe(false);
    expect(hasActiveAccess({ status: "canceled" }).allowed).toBe(false);
  });
});

describe("agent access", () => {
  it("included agents are always accessible", () => {
    expect(canAccessAgent("themis")).toBe(true);
    expect(canAccessAgent("chronos")).toBe(true);
  });

  it("coming-soon agents are locked even if in addonAgents", () => {
    expect(canAccessAgent("metra", { addonAgents: ["metra"] })).toBe(false);
    expect(canAccessAgent("hermes", { addonAgents: ["hermes"] })).toBe(false);
  });

  it("accessibleAgents excludes coming-soon add-ons", () => {
    const list = accessibleAgents({ addonAgents: ["metra", "hermes"] });
    expect(list).toContain("themis");
    expect(list).toContain("chronos");
    expect(list).not.toContain("metra");
    expect(list).not.toContain("hermes");
  });
});
