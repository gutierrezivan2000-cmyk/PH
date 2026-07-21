export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  generateAutoItems,
  monthlyReportItem,
  parseFeatures,
  assemblyItems,
  type BuildingFeatures,
  type AssemblyDerivedItem,
} from "@/lib/compliance";
import { getProperties, DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

export interface CalendarItemDto {
  key: string;
  propertyId: string;
  propertyName: string;
  title: string;
  description: string;
  category: string;
  dueDate: string; // "YYYY-MM-DD"
  source: "auto" | "custom";
  status: "pending" | "done" | "dismissed";
  doneAt?: string | null;
}

async function getDbUserId(): Promise<
  { userId: string } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return {
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  if (IS_DEMO) return { userId: DEMO_USER.id };
  const { db } = await import("@/lib/db");
  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  if (!user) {
    return {
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  return { userId: user.id };
}

export async function GET() {
  const r = await getDbUserId();
  if ("error" in r) return r.error;
  const { userId } = r;
  const today = new Date();

  try {
    let properties: {
      id: string;
      name: string;
      features: BuildingFeatures;
      hasProfile: boolean;
    }[];
    let records: {
      propertyId: string;
      itemKey: string;
      source: string;
      title: string | null;
      description: string | null;
      dueDate: Date | null;
      status: string;
      doneAt: Date | null;
    }[] = [];
    const generatedProps = new Set<string>();
    const assemblyByProp = new Map<string, AssemblyDerivedItem[]>();

    if (IS_DEMO) {
      properties = getProperties(DEMO_USER.id).map((p) => ({
        id: p.id,
        name: p.name,
        features: {},
        hasProfile: true,
      }));
    } else {
      const { db } = await import("@/lib/db");
      const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
      await ensureAdminSchema();

      const props = await db.property.findMany({
        where: { userId },
        select: { id: true, name: true, features: true },
        orderBy: { createdAt: "asc" },
      });
      properties = props.map((p) => ({
        id: p.id,
        name: p.name,
        features: parseFeatures(p.features),
        hasProfile: p.features !== null,
      }));

      if (props.length > 0) {
        const propIds = props.map((p) => p.id);
        records = await db.complianceRecord.findMany({
          where: { propertyId: { in: propIds } },
        });

        // Monthly report auto-completion: any completed generation this month.
        const gens = await db.generation.findMany({
          where: {
            userId,
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            status: "completed",
          },
          select: { propertyId: true },
          distinct: ["propertyId"],
        });
        for (const g of gens) generatedProps.add(g.propertyId);

        // Assembly-derived legal deadlines (convocatoria, acta, impugnación).
        const assemblies = await db.assembly.findMany({
          where: { propertyId: { in: propIds }, status: { not: "cancelada" } },
          select: {
            id: true,
            propertyId: true,
            type: true,
            date: true,
            status: true,
            convokedAt: true,
            actaReadyAt: true,
          },
        });
        for (const a of assemblies) {
          const list = assemblyByProp.get(a.propertyId) || [];
          list.push(...assemblyItems(a, today));
          assemblyByProp.set(a.propertyId, list);
        }
      }
    }

    const recordMap = new Map(
      records.map((rec) => [`${rec.propertyId}:${rec.itemKey}`, rec])
    );

    const items: CalendarItemDto[] = [];

    for (const prop of properties) {
      const autoItems = [
        ...generateAutoItems(prop.features, today),
        monthlyReportItem(today),
        ...(assemblyByProp.get(prop.id) || []),
      ];

      for (const it of autoItems) {
        const rec = recordMap.get(`${prop.id}:${it.key}`);
        let status: CalendarItemDto["status"] = "pending";
        let doneAt: string | null = null;
        if (rec?.status === "done") {
          status = "done";
          doneAt = rec.doneAt?.toISOString() ?? null;
        } else if (rec?.status === "dismissed") {
          status = "dismissed";
        } else if (it.category === "informe" && generatedProps.has(prop.id)) {
          status = "done";
        } else if ((it as AssemblyDerivedItem).autoDone) {
          status = "done";
        }
        items.push({
          key: it.key,
          propertyId: prop.id,
          propertyName: prop.name,
          title: it.title,
          description: it.description,
          category: it.category,
          dueDate: it.dueDate,
          source: "auto",
          status,
          doneAt,
        });
      }
    }

    // Custom items (source = "custom") — full data lives in the record.
    const propNameById = new Map(properties.map((p) => [p.id, p.name]));
    for (const rec of records) {
      if (rec.source !== "custom" || !rec.dueDate || !rec.title) continue;
      const name = propNameById.get(rec.propertyId);
      if (!name) continue;
      items.push({
        key: rec.itemKey,
        propertyId: rec.propertyId,
        propertyName: name,
        title: rec.title,
        description: rec.description || "",
        category: "custom",
        dueDate: rec.dueDate.toISOString().slice(0, 10),
        source: "custom",
        status: (rec.status as CalendarItemDto["status"]) || "pending",
        doneAt: rec.doneAt?.toISOString() ?? null,
      });
    }

    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return NextResponse.json({ items, properties });
  } catch (error) {
    console.error("[CALENDAR GET]", error);
    return NextResponse.json(
      { error: "Error al cargar el calendario" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const r = await getDbUserId();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, title, description, dueDate } = body as {
    propertyId?: string;
    title?: string;
    description?: string;
    dueDate?: string;
  };

  if (!propertyId || !title?.trim() || !dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return NextResponse.json(
      { error: "Propiedad, título y fecha son requeridos." },
      { status: 400 }
    );
  }

  if (IS_DEMO) return NextResponse.json({ ok: true });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const prop = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true },
    });
    if (!prop) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const itemKey = `custom-${crypto.randomUUID()}`;
    const rec = await db.complianceRecord.create({
      data: {
        userId,
        propertyId,
        itemKey,
        source: "custom",
        title: title.trim().slice(0, 200),
        description: description?.trim().slice(0, 2000) || null,
        dueDate: new Date(`${dueDate}T12:00:00`),
        status: "pending",
      },
    });
    return NextResponse.json({ ok: true, id: rec.id }, { status: 201 });
  } catch (error) {
    console.error("[CALENDAR POST]", error);
    return NextResponse.json({ error: "Error al crear el recordatorio" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const r = await getDbUserId();
  if ("error" in r) return r.error;
  const { userId } = r;

  const body = await req.json().catch(() => ({}));
  const { propertyId, itemKey, action } = body as {
    propertyId?: string;
    itemKey?: string;
    action?: string;
  };

  if (!propertyId || !itemKey || !["done", "undo", "dismiss"].includes(action || "")) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  if (IS_DEMO) return NextResponse.json({ ok: true });

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const prop = await db.property.findFirst({
      where: { id: propertyId, userId },
      select: { id: true },
    });
    if (!prop) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    const existing = await db.complianceRecord.findUnique({
      where: { propertyId_itemKey: { propertyId, itemKey } },
    });
    const isCustom = existing?.source === "custom";

    if (action === "done") {
      if (existing) {
        await db.complianceRecord.update({
          where: { id: existing.id },
          data: { status: "done", doneAt: new Date() },
        });
      } else {
        await db.complianceRecord.create({
          data: {
            userId,
            propertyId,
            itemKey,
            source: "auto",
            status: "done",
            doneAt: new Date(),
          },
        });
      }
    } else if (action === "undo") {
      if (existing && isCustom) {
        await db.complianceRecord.update({
          where: { id: existing.id },
          data: { status: "pending", doneAt: null },
        });
      } else if (existing) {
        // Auto item: removing the record restores the computed "pending".
        await db.complianceRecord.delete({ where: { id: existing.id } });
      }
    } else if (action === "dismiss") {
      if (existing && isCustom) {
        await db.complianceRecord.delete({ where: { id: existing.id } });
      } else if (existing) {
        await db.complianceRecord.update({
          where: { id: existing.id },
          data: { status: "dismissed" },
        });
      } else {
        await db.complianceRecord.create({
          data: { userId, propertyId, itemKey, source: "auto", status: "dismissed" },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[CALENDAR PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
