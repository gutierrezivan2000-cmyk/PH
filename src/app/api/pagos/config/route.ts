export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";

const IS_DEMO = process.env.DEMO_MODE === "true";

function mask(v: string | null | undefined): string {
  if (!v) return "";
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

/** Read the admin's ePayco config (secrets masked). */
export async function GET() {
  if (IS_DEMO) return NextResponse.json({ configured: false, publicKey: "", pCustId: "", pKeyMasked: "", test: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  try {
    const { db } = await import("@/lib/db");
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { epaycoPublicKey: true, epaycoPCustId: true, epaycoPKey: true, epaycoTest: true },
    });
    const configured = !!(u?.epaycoPublicKey && u?.epaycoPCustId && u?.epaycoPKey);
    return NextResponse.json({
      configured,
      publicKey: u?.epaycoPublicKey || "", // public key is not secret
      pCustId: u?.epaycoPCustId || "",
      pKeyMasked: mask(u?.epaycoPKey),
      test: u?.epaycoTest ?? true,
    });
  } catch (e) {
    console.error("[pagos config GET]", e);
    return NextResponse.json({ error: "Error al cargar la configuración" }, { status: 500 });
  }
}

/** Save the admin's ePayco config. An empty pKey keeps the stored one. */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { publicKey, pCustId, pKey, test } = body as {
    publicKey?: string;
    pCustId?: string;
    pKey?: string;
    test?: boolean;
  };

  try {
    const { db } = await import("@/lib/db");
    const data: Record<string, unknown> = {
      epaycoPublicKey: publicKey ? String(publicKey).trim().slice(0, 200) : null,
      epaycoPCustId: pCustId ? String(pCustId).trim().slice(0, 100) : null,
      epaycoTest: test !== false,
    };
    // Only overwrite the secret when a real new value (not the mask) is sent.
    if (typeof pKey === "string" && pKey.trim() && !pKey.includes("•")) {
      data.epaycoPKey = pKey.trim().slice(0, 200);
    }
    await db.user.update({ where: { id: userId }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[pagos config POST]", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
