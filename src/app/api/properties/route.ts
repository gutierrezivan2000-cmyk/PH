import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getProperties,
  createProperty,
  deleteProperty,
  DEMO_USER,
} from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

async function ensureUserExists(session: { user: { id: string; email?: string | null; name?: string | null; image?: string | null } }) {
  try {
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
    const dbUserId = await ensureUserExists(session as { user: { id: string; email: string; name: string; image: string } });
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
    const dbUserId = await ensureUserExists(session as { user: { id: string; email: string; name: string; image: string } });
    await db.property.deleteMany({ where: { id, userId: dbUserId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PROPERTIES DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
