import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getProperties,
  createProperty,
  DEMO_USER,
} from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (IS_DEMO) {
    const properties = getProperties(DEMO_USER.id);
    return NextResponse.json(properties);
  }

  const properties = await db.property.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(properties);
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

  const property = await db.property.create({
    data: {
      userId: session.user.id,
      name,
      address,
      city,
      units: units ? parseInt(units) : null,
    },
  });
  return NextResponse.json(property, { status: 201 });
}
