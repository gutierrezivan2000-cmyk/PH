import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // In demo mode: simulate a successful subscription
  if (IS_DEMO) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.json({ url: `${appUrl}/dashboard?success=true&demo=1` });
  }

  // Check if user already has an active subscription
  const existing = await db.subscription.findUnique({
    where: { userId: session.user.id },
  });

  if (existing?.status === "active") {
    return NextResponse.json({ error: "Ya tienes una suscripción activa" }, { status: 400 });
  }

  // Return the checkout configuration for the frontend widget
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const plan = PLANS.pro;

  return NextResponse.json({
    checkoutConfig: {
      name: plan.name,
      description: plan.description,
      invoice: `ph-${session.user.id}-${Date.now()}`,
      currency: plan.currency,
      amount: String(plan.amount),
      tax_base: "0",
      tax: "0",
      country: "co",
      lang: "es",
      external: "false", // onPage modal
      confirmation: `${appUrl}/api/epayco/confirmation`,
      response: `${appUrl}/dashboard/epayco/response`,
      extra1: session.user.id,
      extra2: plan.idPlan,
      extra3: session.user.email ?? "",
      name_billing: session.user.name ?? "",
      email_billing: session.user.email ?? "",
    },
    publicKey: process.env.EPAYCO_PUBLIC_KEY,
    isTest: process.env.EPAYCO_TEST === "true",
  });
}
