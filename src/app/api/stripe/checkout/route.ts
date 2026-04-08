import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCheckoutSession, createOrGetStripeCustomer, PLANS } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { subscription: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Check if already subscribed
  if (user.subscription?.status === "active") {
    return NextResponse.json({ error: "Ya tienes una suscripci\u00f3n activa" }, { status: 400 });
  }

  const customerId = user.subscription?.stripeCustomerId
    ?? await createOrGetStripeCustomer(user.email, user.name ?? undefined);

  // Save customer ID if new
  if (!user.subscription) {
    await db.subscription.create({
      data: {
        userId: user.id,
        stripeCustomerId: customerId,
        status: "inactive",
      },
    });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const checkoutSession = await createCheckoutSession(
    customerId,
    PLANS.pro.priceId,
    `${appUrl}/dashboard?success=true`,
    `${appUrl}/suscripcion?canceled=true`
  );

  return NextResponse.json({ url: checkoutSession.url });
}
