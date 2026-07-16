export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireElite } from "@/lib/elite-auth";
import { db } from "@/lib/db";

/** Progress of a batch run. GET /api/empresa/batch/[id] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const batch = await db.generationBatch.findUnique({ where: { id } });
  if (!batch || batch.userId !== elite.userId) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  const gens = await db.generation.findMany({
    where: { batchId: id },
    include: { property: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const count = (st: string) => gens.filter((g) => g.status === st).length;
  const completed = count("completed");
  const failed = count("failed");
  const pending = count("pending");
  const processing = count("processing");
  const done = pending + processing === 0;

  return NextResponse.json({
    batchId: batch.id,
    month: batch.month,
    year: batch.year,
    docTypes: batch.docTypes,
    total: batch.total,
    completed,
    failed,
    pending,
    processing,
    done,
    items: gens.map((g) => ({
      generationId: g.id,
      propertyId: g.property?.id ?? g.propertyId,
      propertyName: g.property?.name ?? "Propiedad",
      status: g.status,
      errorMessage: g.errorMessage,
    })),
  });
}

/** Retry the failed generations of a batch (re-queue them as pending). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const batch = await db.generationBatch.findUnique({ where: { id } });
  if (!batch || batch.userId !== elite.userId) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  const res = await db.generation.updateMany({
    where: { batchId: id, status: "failed" },
    data: { status: "pending", progress: 0, errorMessage: null },
  });
  if (res.count > 0) {
    await db.generationBatch.update({ where: { id }, data: { status: "processing", completedAt: null } });
  }

  return NextResponse.json({ requeued: res.count });
}
