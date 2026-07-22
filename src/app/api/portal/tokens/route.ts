export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireCartera } from "@/lib/cartera-server";
import { randomBytes } from "node:crypto";

const IS_DEMO = process.env.DEMO_MODE === "true";

function newToken(): string {
  // 15 bytes → 20 url-safe chars ≈ 120 bits. Unguessable, no PII.
  return randomBytes(15).toString("base64url");
}

/** List the property's units with their portal-link status (admin view). */
export async function GET(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ units: [] });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const propertyId = req.nextUrl.searchParams.get("propertyId");
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId requerido" }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const property = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }
    const units = await db.unit.findMany({
      where: { propertyId },
      orderBy: { label: "asc" },
      select: { id: true, label: true, residentName: true, email: true, portalToken: true },
    });
    return NextResponse.json({ units });
  } catch (error) {
    console.error("[portal tokens GET]", error);
    return NextResponse.json({ error: "Error al cargar las unidades" }, { status: 500 });
  }
}

/**
 * Generate resident-portal tokens. Body { propertyId, unitId? }:
 * - with unitId → ensure that one unit has a token (no-op if it already does)
 * - without    → bulk-generate for every unit in the property missing one.
 */
export async function POST(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true, created: 0 });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, unitId } = body as { propertyId?: string; unitId?: string };
  if (!propertyId) {
    return NextResponse.json({ error: "propertyId requerido" }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const property = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const where = unitId
      ? { id: unitId, propertyId, portalToken: null }
      : { propertyId, portalToken: null };
    const targets = await db.unit.findMany({ where, select: { id: true } });

    let created = 0;
    for (const u of targets) {
      // Unique index guards against the rare token collision — retry a couple times.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await db.unit.update({ where: { id: u.id }, data: { portalToken: newToken() } });
          created++;
          break;
        } catch {
          if (attempt === 2) break;
        }
      }
    }

    return NextResponse.json({ ok: true, created });
  } catch (error) {
    console.error("[portal tokens POST]", error);
    return NextResponse.json({ error: "Error al generar los enlaces" }, { status: 500 });
  }
}

/** Rotate (or clear) a single unit's portal token — invalidates a leaked link. */
export async function PATCH(req: NextRequest) {
  if (IS_DEMO) return NextResponse.json({ ok: true });

  const r = await requireCartera();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { unitId, action } = body as { unitId?: string; action?: string };
  if (!unitId || !["rotate", "revoke"].includes(action || "")) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  try {
    const { db } = await import("@/lib/db");
    const unit = await db.unit.findFirst({ where: { id: unitId, userId }, select: { id: true } });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }
    await db.unit.update({
      where: { id: unitId },
      data: { portalToken: action === "rotate" ? newToken() : null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[portal tokens PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar el enlace" }, { status: 500 });
  }
}
