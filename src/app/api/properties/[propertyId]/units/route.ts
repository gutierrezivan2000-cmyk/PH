export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseNumericToken } from "@/lib/cartera";

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
      monthlyFee: number | null;
      coeficiente: number | null;
    }[] = [];
    let skipped = 0;

    for (const line of lines) {
      const emailMatch = line.match(EMAIL_RE);
      const email = emailMatch ? emailMatch[0].toLowerCase() : null;
      if (email && knownEmails.has(email)) {
        skipped++;
        continue;
      }
      // Numeric tokens become cuota (>=1000) / coeficiente (<100); the rest
      // are label + resident name. E.g. "Apto 101, María, maria@x.com, 1,25, 350.000".
      let monthlyFee: number | null = null;
      let coeficiente: number | null = null;
      const textTokens: string[] = [];
      for (const rawToken of line.split(/[,;\t]/)) {
        const t = rawToken.trim();
        if (!t || EMAIL_RE.test(t)) continue;
        const num = parseNumericToken(t);
        if (num?.kind === "fee" && monthlyFee === null) {
          monthlyFee = num.value;
        } else if (num?.kind === "coef" && coeficiente === null) {
          coeficiente = num.value;
        } else if (!num) {
          textTokens.push(t);
        }
      }
      const label =
        textTokens[0]?.slice(0, 60) ||
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
        residentName: textTokens[1]?.slice(0, 100) || null,
        email,
        monthlyFee,
        coeficiente,
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

/** Edit a single unit (inline edits from the cartera table). */
export async function PATCH(
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

    const body = await req.json().catch(() => ({}));
    const { id, label, residentName, email, monthlyFee, coeficiente } = body as {
      id?: string;
      label?: string;
      residentName?: string | null;
      email?: string | null;
      monthlyFee?: number | null;
      coeficiente?: number | null;
    };
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const unit = await db.unit.findFirst({ where: { id, propertyId }, select: { id: true } });
    if (!unit) {
      return NextResponse.json({ error: "Unidad no encontrada" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (label !== undefined) {
      const l = String(label).trim().slice(0, 60);
      if (!l) return NextResponse.json({ error: "El nombre de la unidad no puede quedar vacío." }, { status: 400 });
      data.label = l;
    }
    if (residentName !== undefined) {
      data.residentName = residentName ? String(residentName).trim().slice(0, 100) : null;
    }
    if (email !== undefined) {
      const e = email ? String(email).trim().toLowerCase() : null;
      if (e && !EMAIL_RE.test(e)) {
        return NextResponse.json({ error: "Correo inválido." }, { status: 400 });
      }
      data.email = e;
    }
    if (monthlyFee !== undefined) {
      if (monthlyFee === null) {
        data.monthlyFee = null;
      } else {
        const f = Math.round(Number(monthlyFee));
        if (!Number.isFinite(f) || f < 0 || f > 100_000_000) {
          return NextResponse.json({ error: "Cuota inválida." }, { status: 400 });
        }
        data.monthlyFee = f || null;
      }
    }
    if (coeficiente !== undefined) {
      if (coeficiente === null) {
        data.coeficiente = null;
      } else {
        const c = Number(coeficiente);
        if (!Number.isFinite(c) || c < 0 || c > 100) {
          return NextResponse.json({ error: "Coeficiente inválido (0-100)." }, { status: 400 });
        }
        data.coeficiente = c || null;
      }
    }

    const updated = await db.unit.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[api/units PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar la unidad" }, { status: 500 });
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
