import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-03-31.basil",
  typescript: true,
});

export const PLANS = {
  pro: {
    name: "Plan Profesional",
    priceId: process.env.STRIPE_PRICE_ID!,
    priceMonthly: 20,
    limits: {
      generationsPerDay: 3,
      generationsPerMonth: 15,
      maxFileSizeMb: 25,
      maxFilesPerGeneration: 20,
      maxAudioMinutes: 30,
    },
  },
} as const;

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: 7,
    },
  });
}

export async function createCustomerPortalSession(
  customerId: string,
  returnUrl: string
) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export async function createOrGetStripeCustomer(
  email: string,
  name?: string
): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }
  const customer = await stripe.customers.create({ email, name: name ?? undefined });
  return customer.id;
}
