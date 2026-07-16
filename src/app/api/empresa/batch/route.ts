export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireElite } from "@/lib/elite-auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";

type FileRef = { name: string; url: string; type: string; size: number };

function validPeriod(month: number, year: number) {
  return month >= 1 && month <= 12 && year >= 2020 && year <= 2100;
}

/**
 * Preview: which of the user's properties are READY to generate for a period
 * (have staged monthly data), and which already have a completed generation.
 * GET /api/empresa/batch?month=&year=
 */
export async function GET(req: NextRequest) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const month = parseInt(req.nextUrl.searchParams.get("month") || "", 10);
  const year = parseInt(req.nextUrl.searchParams.get("year") || "", 10);
  if (!validPeriod(month, year)) return NextResponse.json({ error: "Periodo inválido" }, { status: 400 });

  const [properties, staged, completed] = await Promise.all([
    db.property.findMany({
      where: { userId: elite.userId },
      select: { id: true, name: true, city: true, groupLabel: true },
      orderBy: { name: "asc" },
    }),
    db.propertyMonthlyData.findMany({
      where: { userId: elite.userId, month, year },
      select: { propertyId: true, files: true },
    }),
    db.generation.findMany({
      where: { userId: elite.userId, month, year, status: "completed" },
      select: { propertyId: true },
      distinct: ["propertyId"],
    }),
  ]);

  const fileCountByProp = new Map<string, number>();
  for (const s of staged) {
    const files = (s.files as FileRef[] | null) ?? [];
    fileCountByProp.set(s.propertyId, files.length);
  }
  const completedSet = new Set(completed.map((c) => c.propertyId));

  const rows = properties.map((p) => {
    const fileCount = fileCountByProp.get(p.id) ?? 0;
    return {
      propertyId: p.id,
      name: p.name,
      city: p.city,
      groupLabel: p.groupLabel,
      fileCount,
      ready: fileCount > 0,
      alreadyGenerated: completedSet.has(p.id),
    };
  });

  return NextResponse.json({ properties: rows });
}

/**
 * Launch: create a GenerationBatch + pending Generation rows for the selected,
 * ready properties. The cron worker (/api/cron/process-batch) drains them.
 * POST /api/empresa/batch { month, year, docTypes[], propertyIds[], regenerate? }
 */
export async function POST(req: NextRequest) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const month = parseInt(String(body.month), 10);
  const year = parseInt(String(body.year), 10);
  if (!validPeriod(month, year)) return NextResponse.json({ error: "Periodo inválido" }, { status: 400 });

  const docTypes: string[] = Array.isArray(body.docTypes)
    ? body.docTypes.filter((d: string) => ["informe", "acta", "pptx"].includes(d))
    : [];
  const includeInforme = docTypes.includes("informe");
  const includeActa = docTypes.includes("acta");
  const includePptx = docTypes.includes("pptx");
  if (!includeInforme && !includeActa) {
    return NextResponse.json({ error: "Elige al menos informe o acta." }, { status: 400 });
  }

  const requestedIds: string[] = Array.isArray(body.propertyIds) ? body.propertyIds.map(String) : [];
  if (requestedIds.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos una propiedad." }, { status: 400 });
  }
  const regenerate = body.regenerate === true;

  // Resolve the selected properties that the caller actually owns.
  const owned = await db.property.findMany({
    where: { id: { in: requestedIds }, userId: elite.userId },
    select: { id: true },
  });
  const ownedIds = owned.map((p) => p.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ error: "No hay propiedades válidas." }, { status: 400 });
  }

  // Staged data (only ready properties get generated).
  const staged = await db.propertyMonthlyData.findMany({
    where: { userId: elite.userId, month, year, propertyId: { in: ownedIds } },
    select: { propertyId: true, files: true, additionalText: true },
  });
  const stagedByProp = new Map(staged.map((s) => [s.propertyId, s]));

  // Idempotency: skip properties already generated for this period unless regenerate.
  const already = regenerate
    ? []
    : await db.generation.findMany({
        where: { userId: elite.userId, month, year, status: "completed", propertyId: { in: ownedIds } },
        select: { propertyId: true },
        distinct: ["propertyId"],
      });
  const alreadySet = new Set(already.map((a) => a.propertyId));

  // Monthly cap for real Elite (beta/demo = unlimited).
  let remaining = Infinity;
  if (elite.plan === "elite") {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const used = await db.generation.count({
      where: {
        userId: elite.userId,
        createdAt: { gte: startOfMonth },
        status: { in: ["completed", "processing", "pending"] },
      },
    });
    remaining = Math.max(0, PLANS.elite.limits.generationsPerMonth - used);
  }

  // Build the work list.
  let skippedNoData = 0;
  let skippedExisting = 0;
  const toCreate: { propertyId: string; files: FileRef[]; text: string | null }[] = [];
  for (const pid of ownedIds) {
    const s = stagedByProp.get(pid);
    const files = (s?.files as FileRef[] | null) ?? [];
    if (files.length === 0) { skippedNoData++; continue; }
    if (alreadySet.has(pid)) { skippedExisting++; continue; }
    toCreate.push({ propertyId: pid, files, text: s?.additionalText ?? null });
  }

  const capped = Number.isFinite(remaining) ? toCreate.slice(0, remaining as number) : toCreate;
  const skippedCap = toCreate.length - capped.length;

  if (capped.length === 0) {
    return NextResponse.json({
      error: "Ninguna propiedad quedó lista para generar.",
      skippedNoData,
      skippedExisting,
      skippedCap,
    }, { status: 400 });
  }

  const batch = await db.generationBatch.create({
    data: { userId: elite.userId, month, year, docTypes, status: "processing", total: capped.length },
  });

  await db.generation.createMany({
    data: capped.map((c) => ({
      userId: elite.userId,
      propertyId: c.propertyId,
      type: "custom",
      status: "pending",
      month,
      year,
      batchId: batch.id,
      inputFiles: c.files,
      inputText: c.text,
    })),
  });

  return NextResponse.json({
    batchId: batch.id,
    created: capped.length,
    skippedNoData,
    skippedExisting,
    skippedCap,
    docTypes: { includeInforme, includeActa, includePptx },
  });
}
