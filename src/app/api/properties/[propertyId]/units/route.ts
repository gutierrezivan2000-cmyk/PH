export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const MAX_UNITS_PER_PROPERTY = 1000;

async function ownedProperty(propertyId: string, userId: string) {
  return db.property.findFirst({
    where: { id: propertyId, userId },
    select: { id: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { propertyId } = await params;
    const property = await ownedProperty(propertyId, session.user.id);
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const units = await db.unit.findMany({
      where: { propertyId },
      orderBy: { label: "asc" },
    });
    return NextResponse.json(units);
  } catch (error) {
    console.error("[api/units GET]", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * Bulk add from pasted lines. Each line: "Apto 101, María Pérez, maria@x.com"
 * (separators: comma / semicolon / tab). The email is detected anywhere in the
 * line; the first non-email token is the label, the second the resident name.
 * Lines with an email that already exists in this property are skipped.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { propertyId } = await params;
    const property = await ownedProperty(propertyId, session.user.id);
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const body = await req.json().catch(() => ({}));
    const lines = String(body.lines || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_UNITS_PER_PROPERTY);

    if (lines.length === 0) {
      return NextResponse.json({ error: "No hay líneas para importar." }, { status: 400 });
    }

    const [existingCount, existingUnits] = await Promise.all([
      db.unit.count({ where: { propertyId } }),
      db.unit.findMany({
        where: { propertyId, email: { not: null } },
        select: { email: true },
      }),
    ]);
    if (existingCount + lines.length > MAX_UNITS_PER_PROPERTY) {
      return NextResponse.json(
        { error: `Máximo ${MAX_UNITS_PER_PROPERTY} unidades por propiedad.` },
        { status: 400 }
      );
    }
    const knownEmails = new Set(
      existingUnits.map((u) => u.email!.toLowerCase())
    );

    const toCreate: {
      propertyId: string;
      userId: string;
      label: string;
      residentName: string | null;
      email: string | null;
    }[] = [];
    let skipped = 0;

    for (const line of lines) {
      const emailMatch = line.match(EMAIL_RE);
      const email = emailMatch ? emailMatch[0].toLowerCase() : null;
      if (email && knownEmails.has(email)) {
        skipped++;
        continue;
      }
      const tokens = line
        .split(/[,;\t]/)
        .map((t) => t.trim())
        .filter((t) => t && !EMAIL_RE.test(t));
      const label =
        tokens[0]?.slice(0, 60) ||
        (email ? email.split("@")[0].slice(0, 60) : "");
      if (!label && !email) {
        skipped++;
        continue;
      }
      if (email) knownEmails.add(email);
      toCreate.push({
        propertyId,
        userId: session.user.id,
        label: label || "Unidad",
        residentName: tokens[1]?.slice(0, 100) || null,
        email,
      });
    }

    if (toCreate.length > 0) {
      await db.unit.createMany({ data: toCreate });
    }

    return NextResponse.json({ created: toCreate.length, skipped }, { status: 201 });
  } catch (error) {
    console.error("[api/units POST]", error);
    return NextResponse.json({ error: "Error al importar unidades" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { propertyId } = await params;
    const property = await ownedProperty(propertyId, session.user.id);
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const unitId = req.nextUrl.searchParams.get("id");
    if (unitId) {
      await db.unit.deleteMany({ where: { id: unitId, propertyId } });
    } else if (req.nextUrl.searchParams.get("all") === "true") {
      await db.unit.deleteMany({ where: { propertyId } });
    } else {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/units DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
