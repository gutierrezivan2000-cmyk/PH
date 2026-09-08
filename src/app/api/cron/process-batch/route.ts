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

  // Watchdog. Si la función muere sin llegar a su catch —timeout duro de los
  // 300s, despliegue a mitad, OOM— la fila queda en "processing" para siempre:
  // el cron solo recoge "pending", el cierre del lote cuenta processing como
  // trabajo vivo, y el lote nunca se completa ni se puede reintentar desde la
  // UI (el botón "Reintentar fallidas" solo mira status "failed").
  // Se pasan a "failed" y no a "pending" para que no entren en un bucle de
  // reintento infinito y para que ese botón las rescate.
  // El filtro va por updatedAt (ACTIVIDAD) y no por createdAt: en un lote las
  // 50 filas se crean en el mismo instante y se drenan de a pocas por minuto,
  // así que por creación se mataría trabajo vivo.
  const STUCK_MS = 15 * 60 * 1000;
  const reaped = await db.generation.updateMany({
    where: {
      batchId: { not: null },
      status: "processing",
      updatedAt: { lt: new Date(Date.now() - STUCK_MS) },
    },
    data: {
      status: "failed",
      progress: 0,
      errorMessage: "La generación se interrumpió y se canceló. Reintenta las fallidas.",
    },
  });
  if (reaped.count > 0) {
    console.warn(`[cron/process-batch] ${reaped.count} generaciones colgadas marcadas como fallidas`);
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

    // Un lote encolado antes de este cambio puede llevar informe y acta a la
    // vez en docTypes; docSelectionFromTypes lo resuelve a uno solo.
    const { docSelectionFromTypes, normalizeDocSelection, toDocFlags } = await import(
      "@/lib/generation/doc-kind"
    );
    let selection = normalizeDocSelection({ docKind: "informe" });
    if (gen.batchId) {
      const batch = await db.generationBatch.findUnique({
        where: { id: gen.batchId },
        select: { docTypes: true },
      });
      selection = docSelectionFromTypes(batch?.docTypes) ?? selection;
    }
    const { includeInforme, includeActa, includePptx } = toDocFlags(selection);

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
