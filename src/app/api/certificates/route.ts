export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomBytes } from "node:crypto";

const IS_DEMO = process.env.DEMO_MODE === "true";

const TYPES = ["paz_y_salvo", "residencia"] as const;

function newVerifyCode(): string {
  // 12 URL-safe chars ≈ 72 bits of entropy — unguessable, short enough to type.
  return randomBytes(9).toString("base64url");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (IS_DEMO) return NextResponse.json({ certificates: [] });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const where: { userId: string; propertyId?: string } = { userId: session.user.id };
    if (propertyId) where.propertyId = propertyId;

    const certificates = await db.certificate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { property: { select: { name: true } } },
    });
    return NextResponse.json({ certificates });
  } catch (error) {
    console.error("[certificates GET]", error);
    return NextResponse.json({ error: "Error al cargar certificados" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { propertyId, type, unitId, unitLabel, recipientName, recipientDocument, validUntil, residesSince, note } =
    body as {
      propertyId?: string;
      type?: string;
      unitId?: string;
      unitLabel?: string;
      recipientName?: string;
      recipientDocument?: string;
      validUntil?: string;
      residesSince?: string;
      note?: string;
    };

  if (!propertyId || !TYPES.includes(type as (typeof TYPES)[number])) {
    return NextResponse.json({ error: "Tipo de certificado inválido." }, { status: 400 });
  }
  if (!recipientName?.trim()) {
    return NextResponse.json({ error: "El nombre del titular es requerido." }, { status: 400 });
  }
  if (validUntil) {
    // Real calendar-date validation: reject both non-parsing values
    // (2026-13-05) and silently-rolling ones (2026-02-31).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(validUntil);
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
    if (
      !m ||
      !d ||
      d.getUTCFullYear() !== +m[1] ||
      d.getUTCMonth() !== +m[2] - 1 ||
      d.getUTCDate() !== +m[3]
    ) {
      return NextResponse.json({ error: "Fecha de validez inválida." }, { status: 400 });
    }
  }

  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true }, { status: 201 });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
    const { checkSubscriptionAccess } = await import("@/lib/usage");

    const access = await checkSubscriptionAccess(session.user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.reason || "Necesitas una suscripción activa para expedir certificados." },
        { status: 403 }
      );
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    // Resolve the unit. Any client-supplied unitId must belong to THIS
    // property (never persist an unvalidated cross-tenant reference), and when
    // a unit is selected its directory label wins over any stale free text.
    let safeUnitId: string | null = null;
    let label = "";
    if (unitId) {
      const unit = await db.unit.findFirst({
        where: { id: unitId, propertyId },
        select: { label: true },
      });
      if (!unit) {
        return NextResponse.json({ error: "Unidad no encontrada." }, { status: 400 });
      }
      safeUnitId = unitId;
      label = unit.label;
    } else {
      label = unitLabel?.trim().slice(0, 60) || "";
    }
    if (!label) {
      return NextResponse.json({ error: "Indica la unidad (ej: Apto 502)." }, { status: 400 });
    }

    const meta: Record<string, string> = {};
    if (recipientDocument?.trim()) meta.recipientDocument = recipientDocument.trim().slice(0, 30);
    if (validUntil) meta.validUntil = validUntil;
    if (residesSince?.trim()) meta.residesSince = residesSince.trim().slice(0, 100);
    if (note?.trim()) meta.note = note.trim().slice(0, 600);

    const certificate = await db.certificate.create({
      data: {
        userId: session.user.id,
        propertyId,
        unitId: safeUnitId,
        type: type as string,
        recipientName: recipientName.trim().slice(0, 120),
        unitLabel: label,
        meta,
        verifyCode: newVerifyCode(),
      },
    });

    return NextResponse.json({ ok: true, id: certificate.id }, { status: 201 });
  } catch (error) {
    console.error("[certificates POST]", error);
    return NextResponse.json({ error: "Error al expedir el certificado" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, action } = body as { id?: string; action?: string };
  if (!id || !["revoke", "restore"].includes(action || "")) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  if (IS_DEMO) return NextResponse.json({ ok: true });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const existing = await db.certificate.findFirst({
      where: { id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Certificado no encontrado" }, { status: 404 });
    }

    await db.certificate.update({
      where: { id },
      data:
        action === "revoke"
          ? { status: "revoked", revokedAt: new Date() }
          : { status: "valid", revokedAt: null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[certificates PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
