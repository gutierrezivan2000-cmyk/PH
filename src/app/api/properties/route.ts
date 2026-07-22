import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getProperties,
  createProperty,
  deleteProperty,
  updateProperty,
  DEMO_USER,
} from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

async function getDb() {
  const { db } = await import("@/lib/db");
  return db;
}

async function ensureUserExists(session: { user: { id: string; email?: string | null; name?: string | null; image?: string | null } }) {
  try {
    const db = await getDb();
    const existing = await db.user.findUnique({ where: { email: session.user.email! } });
    if (existing) return existing.id;
    const created = await db.user.create({
      data: {
        email: session.user.email!,
        name: session.user.name,
        image: session.user.image,
      },
    });
    return created.id;
  } catch {
    return session.user.id;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (IS_DEMO) {
    const properties = getProperties(DEMO_USER.id);
    return NextResponse.json(properties);
  }

  try {
    const db = await getDb();
    const dbUserId = await ensureUserExists(session as { user: { id: string; email: string; name: string; image: string } });
    const properties = await db.property.findMany({
      where: { userId: dbUserId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(properties);
  } catch (error) {
    console.error("[PROPERTIES GET]", error);
    return NextResponse.json({ error: "Error al cargar propiedades" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { name, address, city, units } = body;

  if (!name) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }

  if (IS_DEMO) {
    const property = createProperty({
      userId: DEMO_USER.id,
      name,
      address,
      city,
      units: units ? parseInt(units) : null,
    });
    return NextResponse.json(property, { status: 201 });
  }

  try {
    const db = await getDb();
    const dbUserId = await ensureUserExists(session as { user: { id: string; email: string; name: string; image: string } });

    // Enforce the plan's property cap (Pro 3, Business 10, Elite unlimited).
    const { checkPropertyLimit } = await import("@/lib/usage");
    const limitCheck = await checkPropertyLimit(dbUserId);
    if (!limitCheck.allowed) {
      return NextResponse.json({ error: limitCheck.reason, code: "property_limit" }, { status: 403 });
    }

    const property = await db.property.create({
      data: {
        userId: dbUserId,
        name,
        address,
        city,
        units: units ? parseInt(units) : null,
      },
    });
    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error("[PROPERTIES POST]", error);
    return NextResponse.json({ error: "Error al guardar la propiedad" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { id, name, address, city, units, features, whatsapp } = body;

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  // Settings-only update (building profile from the compliance calendar, or the
  // WhatsApp contact) — name is not required in that case.
  const isSettingsOnly = name === undefined && (features !== undefined || whatsapp !== undefined);
  if (!name && !isSettingsOnly) {
    return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
  }
  const cleanWhatsapp =
    whatsapp === undefined ? undefined : whatsapp ? String(whatsapp).trim().slice(0, 20) || null : null;

  if (IS_DEMO) {
    if (isSettingsOnly) return NextResponse.json({ ok: true });
    const updated = updateProperty(id, DEMO_USER.id, {
      name,
      address,
      city,
      units: units ? parseInt(units) : null,
    });
    if (!updated) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }
    return NextResponse.json(updated);
  }

  try {
    const db = await getDb();
    const dbUserId = await ensureUserExists(session as { user: { id: string; email: string; name: string; image: string } });

    // Verify ownership
    const existing = await db.property.findFirst({ where: { id, userId: dbUserId } });
    if (!existing) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    if (isSettingsOnly) {
      const data: Record<string, unknown> = {};
      if (features !== undefined) {
        const { parseFeatures } = await import("@/lib/compliance");
        data.features = parseFeatures(features) as object;
      }
      if (cleanWhatsapp !== undefined) data.whatsapp = cleanWhatsapp;
      const updated = await db.property.update({ where: { id }, data });
      return NextResponse.json(updated);
    }

    const updated = await db.property.update({
      where: { id },
      data: {
        name,
        address,
        city,
        units: units ? parseInt(units) : null,
        ...(cleanWhatsapp !== undefined ? { whatsapp: cleanWhatsapp } : {}),
        ...(features !== undefined
          ? {
              features: (await import("@/lib/compliance")).parseFeatures(
                features
              ) as object,
            }
          : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PROPERTIES PUT]", error);
    return NextResponse.json({ error: "Error al actualizar la propiedad" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  if (IS_DEMO) {
    deleteProperty(id, DEMO_USER.id);
    return NextResponse.json({ ok: true });
  }

  try {
    const db = await getDb();
    const dbUserId = await ensureUserExists(session as { user: { id: string; email: string; name: string; image: string } });
    await db.property.deleteMany({ where: { id, userId: dbUserId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PROPERTIES DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
