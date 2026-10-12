export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireElite } from "@/lib/elite-auth";
import { db } from "@/lib/db";
import { cupoMensualRestante, inicioDeMesBogota, topeMensualElite } from "@/lib/generation/cupo-lote";

/** Progress of a batch run. GET /api/empresa/batch/[id] */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(
      { error: "La generación en lote no está disponible en el demo. Crea tu cuenta para usarla." },
      { status: 403 }
    );
  }

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

/**
 * Retry the failed generations of a batch (re-queue them as pending).
 *
 * Un reintento es un intento más y se limita como el primero (ver cupo-lote.ts):
 *  - Las fallidas no gastan cupo, así que reencolar una no la cobra dos veces: pasa de "no cuenta" a "cuenta una vez".
 *  - Solo se reencolan tantas como cupo mensual quede (Élite real; beta/demo no tienen tope), las más antiguas primero.
 *    El resto sigue fallida y se puede reintentar cuando haya cupo.
 *  - Las fallidas creadas en un mes anterior no se reencolan: el conteo es por mes de creación y una fila vieja que
 *    corriera hoy no gastaría el cupo de este mes. Se relanzan como lote nuevo, que sí pasa por el tope.
 *  - Contar y reencolar no son una sola operación: dos reintentos simultáneos de lotes distintos podrían pasarse por
 *    unas pocas filas, el mismo margen que ya tiene el alta del lote.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(
      { error: "La generación en lote no está disponible en el demo. Crea tu cuenta para usarla." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const batch = await db.generationBatch.findUnique({ where: { id } });
  if (!batch || batch.userId !== elite.userId) {
    return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
  }

  const fallidas = await db.generation.findMany({
    where: { batchId: id, status: "failed" },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });

  const inicioDeMes = inicioDeMesBogota();
  const delMes = fallidas.filter((f) => f.createdAt >= inicioDeMes);
  const skippedAntiguas = fallidas.length - delMes.length;

  // Beta/demo no tienen tope; el Élite real, el que quede este mes.
  const restante = delMes.length > 0 && elite.plan === "elite" ? await cupoMensualRestante(elite.userId, inicioDeMes) : Infinity;
  const aReencolar = delMes.slice(0, restante);
  const skippedCap = delMes.length - aReencolar.length;

  let requeued = 0;
  if (aReencolar.length > 0) {
    // Se re-filtra por estado: dos reintentos a la vez no reencolan dos veces la misma fila.
    const res = await db.generation.updateMany({
      where: { id: { in: aReencolar.map((f) => f.id) }, batchId: id, status: "failed" },
      data: { status: "pending", progress: 0, errorMessage: null },
    });
    requeued = res.count;
    if (requeued > 0) {
      await db.generationBatch.update({ where: { id }, data: { status: "processing", completedAt: null } });
    }
  }

  if (requeued === 0 && skippedCap > 0) {
    return NextResponse.json(
      {
        error: `Llegaste al tope de ${topeMensualElite()} generaciones de este mes. Las fallidas se podrán reintentar cuando se renueve el cupo.`,
        requeued,
        skippedCap,
        skippedAntiguas,
      },
      { status: 429 }
    );
  }
  if (requeued === 0 && skippedAntiguas > 0) {
    return NextResponse.json(
      {
        error: "Estas fallidas son de un mes anterior y no se reintentan. Crea un lote nuevo con las mismas propiedades.",
        requeued,
        skippedCap,
        skippedAntiguas,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ requeued, skippedCap, skippedAntiguas });
}
