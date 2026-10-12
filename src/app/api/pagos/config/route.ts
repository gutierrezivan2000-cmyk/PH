export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { leerPKeyYMigrar } from "@/lib/epayco-llaves";
import { encryptSecret, SecretBoxError } from "@/lib/secret-box";

const IS_DEMO = process.env.DEMO_MODE === "true";

/**
 * Read the admin's ePayco config. La P_KEY NUNCA sale de aquí, ni completa ni en fragmentos (antes se devolvían los últimos 4
 * caracteres): solo se informa si hay una guardada (`pKeyConfigured`) y si ya no se puede leer (`pKeyIlegible`).
 */
export async function GET() {
  if (IS_DEMO) {
    return NextResponse.json({ configured: false, publicKey: "", pCustId: "", pKeyConfigured: false, pKeyIlegible: false, test: true });
  }

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  try {
    const { db } = await import("@/lib/db");
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { epaycoPublicKey: true, epaycoPCustId: true, epaycoPKey: true, epaycoTest: true },
    });
    // Descifra para saber si la llave sirve; si seguía en claro (guardada antes del cifrado) la deja cifrada de paso.
    const llave = await leerPKeyYMigrar(userId, u?.epaycoPKey, "pagos config GET");
    const pKeyConfigured = llave.estado === "ok";
    const configured = !!(u?.epaycoPublicKey && u?.epaycoPCustId) && pKeyConfigured;
    return NextResponse.json({
      configured,
      publicKey: u?.epaycoPublicKey || "", // public key is not secret
      pCustId: u?.epaycoPCustId || "",
      pKeyConfigured,
      pKeyIlegible: llave.estado === "ilegible",
      test: u?.epaycoTest ?? true,
    });
  } catch (e) {
    console.error("[pagos config GET]", e);
    return NextResponse.json({ error: "Error al cargar la configuración" }, { status: 500 });
  }
}

/** Save the admin's ePayco config. An empty pKey keeps the stored one. La P_KEY se guarda siempre cifrada. */
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
      // Si no hay con qué cifrar esto lanza ANTES de escribir: nunca se guarda en claro ni se guarda la configuración a medias.
      data.epaycoPKey = encryptSecret(pKey.trim().slice(0, 200));
    }
    await db.user.update({ where: { id: userId }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SecretBoxError) {
      // El mensaje del error nunca lleva la llave; en el log solo va el motivo.
      console.error("[pagos config POST] no se pudo cifrar la P_KEY", { motivo: e.code });
      return NextResponse.json(
        { error: "No pudimos guardar la llave de forma segura: la clave de cifrado del servidor no está configurada o no es válida. Avisa a soporte." },
        { status: 500 }
      );
    }
    console.error("[pagos config POST]", e);
    return NextResponse.json({ error: "Error al guardar" }, { status: 500 });
  }
}
