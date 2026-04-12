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

export const PLANS = {
  pro: {
    name: "Plan Profesional",
    idPlan: "plan-profesional-ph",
    description: "Suscripción mensual PH Gestión — generación de informes y actas",
    amount: 89900, // COP — adjust as needed
    currency: "cop",
    interval: "month",
    intervalCount: 1,
    trialDays: 7,
    limits: {
      generationsPerDay: 3,
      generationsPerMonth: 15,
      maxFileSizeMb: 25,
      maxFilesPerGeneration: 20,
      maxAudioMinutes: 30,
    },
  },
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
