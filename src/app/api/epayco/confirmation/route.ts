import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateConfirmationSignature, verifyTransaction } from "@/lib/epayco";

// ePayco sends a POST (or GET) to this endpoint after each transaction.
// This is the server-to-server callback — NOT user-facing.

export async function POST(req: NextRequest) {
  try {
    const body = await req.formData().catch(() => null);
    const params = body
      ? Object.fromEntries(body.entries())
      : Object.fromEntries(req.nextUrl.searchParams.entries());

    const {
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
      x_signature,
      x_cod_response,
      x_id_invoice,
      x_extra1, // userId
    } = params as Record<string, string>;

    if (!x_ref_payco || !x_transaction_id) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Validate signature
    const isValid = validateConfirmationSignature({
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
      x_signature,
    });

    if (!isValid) {
      console.error("[ePayco confirmation] Invalid signature", { x_ref_payco });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Double-check with ePayco API
    const verification = await verifyTransaction(x_ref_payco);
    const codResponse = verification.success
      ? String(verification.data?.x_cod_response ?? x_cod_response)
      : String(x_cod_response);

    const userId = x_extra1;
    if (!userId) {
      console.error("[ePayco confirmation] No userId in extra1", { x_ref_payco });
      return NextResponse.json({ received: true });
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    if (codResponse === "1") {
      // ── APPROVED ──
      await db.subscription.upsert({
        where: { userId },
        create: {
          userId,
          status: "active",
          epaycoRef: x_ref_payco,
          planId: String(x_id_invoice ?? "plan-profesional-ph"),
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
        update: {
          status: "active",
          epaycoRef: x_ref_payco,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });
    } else if (codResponse === "2" || codResponse === "4") {
      // ── REJECTED or FAILED ──
      await db.subscription.updateMany({
        where: { userId },
        data: {
          status: "past_due",
          epaycoRef: x_ref_payco,
        },
      });
    }
    // codResponse === "3" (pending) — no action, wait for final confirmation

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[ePayco confirmation] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ePayco may also send GET requests depending on configuration
export async function GET(req: NextRequest) {
  return POST(req);
}
