export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const documents = await db.propertyDocument.findMany({
      where: { propertyId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("[api/properties/documents] Error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

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

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const { type, name, url, size, mimeType } = await req.json();

    if (!type || !name || !url) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const doc = await db.propertyDocument.create({
      data: {
        propertyId,
        type,
        name,
        url,
        size: size || 0,
        mimeType: mimeType || null,
      },
    });

    return NextResponse.json(doc);
  } catch (error) {
    console.error("[api/properties/documents] POST error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
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
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("docId");

    if (!docId) {
      return NextResponse.json({ error: "docId requerido" }, { status: 400 });
    }

    const property = await db.property.findFirst({
      where: { id: propertyId, userId: session.user.id },
    });
    if (!property) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    await db.propertyDocument.deleteMany({
      where: { id: docId, propertyId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/properties/documents] DELETE error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
