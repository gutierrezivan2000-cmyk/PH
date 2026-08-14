export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { normalizeAssetKind, advanceDueDate } from "@/lib/common-assets";

const IS_DEMO = process.env.DEMO_MODE === "true";
const MAX_RECURRENCE_MONTHS = 60;

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Registro de zonas comunes y pólizas (bitácora). */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const propertyId = req.nextUrl.searchParams.get("propertyId");
  // La acción "restore" existía pero era inalcanzable: sin poder listar los
  // archivados, un activo sin recurrencia marcado como "hecho" desaparecía
  // para siempre.
  const wantArchived = req.nextUrl.searchParams.get("status") === "archived";

  if (IS_DEMO) {
    const { getDemoCommonAssets } = await import("@/lib/demo-store");
    return NextResponse.json({ assets: wantArchived ? [] : getDemoCommonAssets(propertyId) });
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const where: { userId: string; status: string; propertyId?: string } = {
      userId: session.user.id,
      status: wantArchived ? "archived" : "active",
    };
    if (propertyId) where.propertyId = propertyId;

    const assets = await db.commonAsset.findMany({ where, orderBy: { dueDate: "asc" } });
    return NextResponse.json({ assets });
  } catch (error) {
    console.error("[common-assets GET]", error);
    return NextResponse.json({ error: "Error al cargar la bitácora" }, { status: 500 });
  }
}

interface AssetInput {
  propertyId?: string;
  kind?: string;
  name?: string;
  provider?: string;
  reference?: string;
  notes?: string;
  dueDate?: string;
  recurrenceMonths?: number | string | null;
}

/** Valida y normaliza un renglón; null si le falta algo obligatorio. */
function parseAssetInput(raw: AssetInput, fallbackPropertyId?: string) {
  const propertyId = raw.propertyId || fallbackPropertyId;
  const dueDate = parseDate(raw.dueDate);
  const name = raw.name?.trim().slice(0, 150) || "";
  if (!propertyId || !name || !dueDate) return null;

  const recurrenceRaw = raw.recurrenceMonths;
  const recurrenceMonths =
    recurrenceRaw != null && recurrenceRaw !== "" ? Number(recurrenceRaw) : null;
  if (
    recurrenceMonths != null &&
    (!Number.isInteger(recurrenceMonths) || recurrenceMonths < 1 || recurrenceMonths > MAX_RECURRENCE_MONTHS)
  ) {
    return null;
  }

  return {
    propertyId,
    kind: normalizeAssetKind(raw.kind),
    name,
    provider: raw.provider?.trim().slice(0, 150) || null,
    reference: raw.reference?.trim().slice(0, 100) || null,
    notes: raw.notes?.trim().slice(0, 2000) || null,
    dueDate,
    recurrenceMonths,
  };
}

/**
 * Crea zonas comunes/pólizas. Body de un solo registro, o
 * { propertyId, assets: [...] } para confirmar la revisión del import por IA.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const isBulk = Array.isArray((body as { assets?: unknown }).assets);
  const fallbackPropertyId = (body as { propertyId?: string }).propertyId;

  const rows = (isBulk ? (body as { assets: AssetInput[] }).assets : [body as AssetInput])
    .slice(0, 300)
    .map((r) => parseAssetInput(r, fallbackPropertyId))
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Propiedad, nombre y fecha son requeridos." },
      { status: 400 }
    );
  }

  if (IS_DEMO) {
    const { createDemoCommonAsset } = await import("@/lib/demo-store");
    const created = rows.map((r) => createDemoCommonAsset({ ...r, dueDate: r.dueDate.toISOString() }));
    return NextResponse.json(
      isBulk ? { ok: true, created: created.length } : { ok: true, asset: created[0] },
      { status: 201 }
    );
  }

  try {
    const { db } = await import("@/lib/db");
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();

    const propertyIds = [...new Set(rows.map((r) => r.propertyId))];
    const owned = await db.property.findMany({
      where: { id: { in: propertyIds }, userId: session.user.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((p) => p.id));
    const toCreate = rows.filter((r) => ownedIds.has(r.propertyId));
    if (toCreate.length === 0) {
      return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
    }

    if (isBulk) {
      const { count } = await db.commonAsset.createMany({
        data: toCreate.map((r) => ({ ...r, userId: session.user.id })),
      });
      return NextResponse.json({ ok: true, created: count }, { status: 201 });
    }

    const asset = await db.commonAsset.create({ data: { ...toCreate[0], userId: session.user.id } });
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (error) {
    console.error("[common-assets POST]", error);
    return NextResponse.json({ error: "Error al crear el registro" }, { status: 500 });
  }
}

/**
 * Marca un activo. `action: "done"` en un activo recurrente adelanta su fecha
 * al próximo ciclo en vez de solo tacharlo — así vuelve a aparecer cuando le
 * toque de nuevo. En uno no recurrente, "done" lo archiva (ya no vuelve).
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { id, action } = body as { id?: string; action?: string };
  if (!id || !["done", "archive", "restore"].includes(action || "")) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  if (IS_DEMO) {
    const { updateDemoCommonAsset } = await import("@/lib/demo-store");
    const asset = updateDemoCommonAsset(id, action as "done" | "archive" | "restore");
    if (!asset) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, asset });
  }

  try {
    const { db } = await import("@/lib/db");
    const existing = await db.commonAsset.findFirst({ where: { id, userId: session.user.id } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    if (action === "done") {
      const asset = existing.recurrenceMonths
        ? await db.commonAsset.update({
            where: { id },
            data: {
              dueDate: advanceDueDate(existing.dueDate, existing.recurrenceMonths),
              lastDoneAt: new Date(),
            },
          })
        : await db.commonAsset.update({
            where: { id },
            data: { status: "archived", lastDoneAt: new Date() },
          });
      return NextResponse.json({ ok: true, asset });
    }

    const asset = await db.commonAsset.update({
      where: { id },
      data: { status: action === "archive" ? "archived" : "active" },
    });
    return NextResponse.json({ ok: true, asset });
  } catch (error) {
    console.error("[common-assets PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  if (IS_DEMO) {
    const { deleteDemoCommonAsset } = await import("@/lib/demo-store");
    deleteDemoCommonAsset(id);
    return NextResponse.json({ ok: true });
  }

  try {
    const { db } = await import("@/lib/db");
    await db.commonAsset.deleteMany({ where: { id, userId: session.user.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[common-assets DELETE]", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
