/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";

// Lazy-init: only create client when actually called
let _epayco: any = null;

function getEpayco(): any {
  if (!_epayco) {
    const apiKey = process.env.EPAYCO_PUBLIC_KEY;
    const privateKey = process.env.EPAYCO_PRIVATE_KEY;
    const isTest = process.env.EPAYCO_TEST === "true";

    if (!apiKey || !privateKey) {
      throw new Error("ePayco no está configurado");
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Epayco = require("epayco-sdk-node");
    _epayco = Epayco({
      apiKey,
      privateKey,
      lang: "ES",
      test: isTest,
    });
  }
  return _epayco;
}

export const epayco = new Proxy({} as any, {
  get(_target, prop) {
    return (getEpayco() as Record<string | symbol, unknown>)[prop];
  },
});

// ── Plan configuration ────────────────────────────────────────────────────────

// Billing is in Colombian pesos (COP) via ePayco — local cards convert without
// FX risk for the customer. `amount` is what ePayco charges; `usd` is the
// approximate USD equivalent used only for admin MRR/reporting (TRM ~$4.100).
export const PLANS = {
  pro: {
    name: "Plan Pro",
    idPlan: "plan-pro-ph",
    description: "Hasta 3 propiedades — informes y actas con IA",
    amount: 99900,
    currency: "cop",
    usd: 24,
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    maxProperties: 3,
    limits: {
      generationsPerDay: 3,
      generationsPerMonth: 15,
      maxFileSizeMb: 25,
      maxFilesPerGeneration: 20,
      maxAudioMinutes: 30,
      agentMessagesPerDay: 30,
      agentMessagesPerWeek: 150,
      transcriptionMinutesPerDay: 20,
      transcriptionMinutesPerMonth: 120,
      transcriptionMaxFileMb: 25,
    },
  },
  business: {
    name: "Plan Business",
    idPlan: "plan-business-ph",
    description: "Hasta 10 propiedades — para administradores en crecimiento",
    amount: 299900,
    currency: "cop",
    usd: 73,
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    maxProperties: 10,
    limits: {
      generationsPerDay: 5,
      generationsPerMonth: 40,
      maxFileSizeMb: 25,
      maxFilesPerGeneration: 20,
      maxAudioMinutes: 45,
      agentMessagesPerDay: 60,
      agentMessagesPerWeek: 400,
      transcriptionMinutesPerDay: 40,
      transcriptionMinutesPerMonth: 300,
      transcriptionMaxFileMb: 25,
    },
  },
  elite: {
    name: "Plan Elite",
    idPlan: "plan-elite-ph",
    description: "Propiedades ilimitadas — para grandes administradores",
    amount: 749900,
    currency: "cop",
    usd: 183,
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    maxProperties: 999,
    limits: {
      generationsPerDay: 10,
      generationsPerMonth: 100,
      maxFileSizeMb: 25,
      maxFilesPerGeneration: 20,
      maxAudioMinutes: 60,
      agentMessagesPerDay: 150,
      agentMessagesPerWeek: 1000,
      transcriptionMinutesPerDay: 60,
      transcriptionMinutesPerMonth: 800,
      transcriptionMaxFileMb: 25,
    },
  },
} as const;

/**
 * Free-trial limits. Deliberately stricter than any paid plan: the trial is a
 * taste of the product, not a full month of Pro. Total (not monthly) caps so a
 * trial can't be milked, and small file caps bound the AI cost per trialer.
 */
export const TRIAL_LIMITS = {
  totalGenerations: 5,
  generationsPerDay: 2,
  agentMessagesPerDay: 15,
  transcriptionMinutesTotal: 20,
  maxFilesPerGeneration: 5,
  maxFileSizeMb: 10,
} as const;

// ── ePayco plan management ────────────────────────────────────────────────────

export async function ensurePlanExists(): Promise<void> {
  const plan = PLANS.pro;
  try {
    const existing = await epayco.plans.get(plan.idPlan);
    if (existing?.status) return; // Plan exists
  } catch {
    // Plan doesn't exist — create it
  }

  await epayco.plans.create({
    id_plan: plan.idPlan,
    name: plan.name,
    description: plan.description,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    interval_count: plan.intervalCount,
    trial_days: plan.trialDays,
  });
}

// ── Signature validation ──────────────────────────────────────────────────────

export function validateConfirmationSignature(params: {
  x_ref_payco: string;
  x_transaction_id: string;
  x_amount: string;
  x_currency_code: string;
  x_signature: string;
}): boolean {
  const custId = process.env.EPAYCO_P_CUST_ID;
  const pKey = process.env.EPAYCO_P_KEY;

  if (!custId || !pKey) {
    console.error("ePayco P_CUST_ID or P_KEY not configured");
    return false;
  }

  const { x_ref_payco, x_transaction_id, x_amount, x_currency_code, x_signature } = params;

  const expected = crypto
    .createHash("sha256")
    .update(`${custId}^${pKey}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`)
    .digest("hex");

  return expected === x_signature;
}

/**
 * Signature validation with explicit merchant credentials — used for resident
 * administration payments, which settle into the ADMIN's own ePayco account,
 * so we must validate with THEIR P_CUST_ID / P_KEY (not SOPH.IA's env keys).
 */
export function validateSignatureWith(
  custId: string,
  pKey: string,
  params: {
    x_ref_payco: string;
    x_transaction_id: string;
    x_amount: string;
    x_currency_code: string;
    x_signature: string;
  }
): boolean {
  if (!custId || !pKey) return false;
  const expected = crypto
    .createHash("sha256")
    .update(
      `${custId}^${pKey}^${params.x_ref_payco}^${params.x_transaction_id}^${params.x_amount}^${params.x_currency_code}`
    )
    .digest("hex");
  return expected === params.x_signature;
}

// ── Transaction verification via API ──────────────────────────────────────────

export async function verifyTransaction(refPayco: string): Promise<{
  success: boolean;
  status: string;
  data: any;
}> {
  try {
    const response = await fetch(
      `https://secure.epayco.co/validation/v1/reference/${refPayco}`
    );
    const result = await response.json();

    if (!result.success) {
      return { success: false, status: "error", data: result };
    }

    const txData = result.data;
    const codResponse = String(txData.x_cod_response);

    let status: string;
    switch (codResponse) {
      case "1":
        status = "approved";
        break;
      case "2":
        status = "rejected";
        break;
      case "3":
        status = "pending";
        break;
      default:
        status = "failed";
    }

    return { success: true, status, data: txData };
  } catch (error) {
    console.error("Error verifying ePayco transaction:", error);
    return { success: false, status: "error", data: null };
  }
}

// ── Subscription helpers ──────────────────────────────────────────────────────

export async function createSubscription(params: {
  tokenCard: string;
  customerId: string;
  planId: string;
  docType: string;
  docNumber: string;
  confirmationUrl: string;
}): Promise<any> {
  return epayco.subscriptions.create({
    id_plan: params.planId,
    customer: params.customerId,
    token_card: params.tokenCard,
    doc_type: params.docType,
    doc_number: params.docNumber,
    url_confirmation: params.confirmationUrl,
    method_confirmation: "POST",
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<any> {
  return epayco.subscriptions.cancel(subscriptionId);
}
