export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runGeneration, type BlobFileRef } from "@/lib/generation/run";

// How many batch generations to process per cron tick. Kept low so we pace
// Anthropic's rate limit; raise once on Tier 2. Each is awaited sequentially.
const PER_RUN = Math.max(1, parseInt(process.env.BATCH_PER_RUN || "2", 10));

/**
 * Queue drainer for enterprise batch generation. Vercel Cron calls this every
 * minute with Authorization: Bearer <CRON_SECRET>. Picks the next pending batch
 * generations, claims each atomically, and runs the shared generation worker.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pending = await db.generation.findMany({
    where: { status: "pending", batchId: { not: null } },
    orderBy: { createdAt: "asc" },
    take: PER_RUN,
    select: { id: true },
  });

  let processed = 0;
  for (const row of pending) {
    // Atomic claim so overlapping cron ticks never double-process a row.
    const claim = await db.generation.updateMany({
      where: { id: row.id, status: "pending" },
      data: { status: "processing", progress: 1 },
    });
    if (claim.count !== 1) continue;

    const gen = await db.generation.findUnique({
      where: { id: row.id },
      include: { property: { select: { name: true } } },
    });
    if (!gen) continue;

    let includeInforme = true;
    let includeActa = false;
    let includePptx = false;
    if (gen.batchId) {
      const batch = await db.generationBatch.findUnique({
        where: { id: gen.batchId },
        select: { docTypes: true },
      });
      const dt = batch?.docTypes ?? [];
      includeInforme = dt.includes("informe");
      includeActa = dt.includes("acta");
      includePptx = dt.includes("pptx");
      if (!includeInforme && !includeActa) includeInforme = true; // safety net
    }

    const blobFiles = (gen.inputFiles as BlobFileRef[] | null) ?? [];
    try {
      await runGeneration({
        generationId: gen.id,
        userId: gen.userId,
        propertyName: gen.property?.name ?? "Propiedad",
        month: gen.month,
        year: gen.year,
        blobFiles,
        additionalText: gen.inputText,
        includeInforme,
        includeActa,
        includePptx,
      });
      processed++;
    } catch (e) {
      // runGeneration already marks the row failed on error; log and continue.
      console.error("[cron/process-batch] generation failed:", gen.id, e);
    }
  }

  // Close out batches that have no more work.
  const open = await db.generationBatch.findMany({
    where: { status: "processing" },
    select: { id: true },
    take: 100,
  });
  for (const b of open) {
    const remaining = await db.generation.count({
      where: { batchId: b.id, status: { in: ["pending", "processing"] } },
    });
    if (remaining === 0) {
      await db.generationBatch.update({
        where: { id: b.id },
        data: { status: "completed", completedAt: new Date() },
      });
    }
  }

  return NextResponse.json({ processed, pickedUp: pending.length });
}
