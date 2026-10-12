export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireElite } from "@/lib/elite-auth";
import { db } from "@/lib/db";
import { cupoMensualRestante } from "@/lib/generation/cupo-lote";
import { primerBlobAjeno } from "@/lib/blob-owner";
import { rateLimit } from "@/lib/rate-limit";

/** Respuesta cuando los insumos preparados de alguna propiedad incluyen un archivo que no es de quien lanza el lote. */
const MENSAJE_INSUMO_AJENO =
  "Los insumos preparados para una de las propiedades incluyen un archivo que no pertenece a tu cuenta, así que no se creó el lote. " +
  "Quítalo y vuelve a subirlo desde la pantalla de la propiedad e inténtalo de nuevo.";

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
  if (process.env.DEMO_MODE === "true") {
    // Misma forma exacta que las filas reales de abajo: la UI indexa por
    // `propertyId` y lo usa como key de React.
    const { getProperties } = await import("@/lib/demo-store");
    return NextResponse.json({
      properties: getProperties(elite.userId).map((p) => ({
        propertyId: p.id,
        name: p.name,
        city: p.city,
        groupLabel: p.groupLabel,
        fileCount: 0,
        ready: false,
        alreadyGenerated: false,
      })),
    });
  }

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
      select: { propertyId: true, outputFiles: true },
    }),
  ]);

  const fileCountByProp = new Map<string, number>();
  for (const s of staged) {
    const files = (s.files as FileRef[] | null) ?? [];
    fileCountByProp.set(s.propertyId, files.length);
  }
  // "Ya generado" depende del documento que se vaya a pedir: con informe y acta
  // como tipos excluyentes, marcar una propiedad por tener el informe hecho
  // hacía que BatchGenerator la deseleccionara al preparar un lote de actas.
  const previewKind = req.nextUrl.searchParams.get("docKind") === "acta" ? "actaHtml" : "informeHtml";
  const completedSet = new Set(
    completed
      .filter((c) => !!(c.outputFiles as Record<string, string> | null)?.[previewKind])
      .map((c) => c.propertyId)
  );

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
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(
      { error: "La generación en lote no está disponible en el demo. Crea tu cuenta para usarla." },
      { status: 403 }
    );
  }

  // Freno por usuario: cada lote encola trabajo de IA de pago. Cierra en falso si la base falla (sin contador no hay freno).
  const rl = await rateLimit(`empresa-batch:${elite.userId}`, { max: 20, windowMs: 10 * 60 * 1000, failClosed: true });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados lotes en poco tiempo. Espera unos minutos e inténtalo de nuevo." },
      { status: rl.unavailable ? 503 : 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const month = parseInt(String(body.month), 10);
  const year = parseInt(String(body.year), 10);
  if (!validPeriod(month, year)) return NextResponse.json({ error: "Periodo inválido" }, { status: 400 });

  // Un lote produce UN tipo de documento: informe o acta, nunca ambos.
  const { docSelectionFromTypes, docTypesFromSelection } = await import("@/lib/generation/doc-kind");
  const selection = docSelectionFromTypes(body.docTypes);
  if (!selection) {
    return NextResponse.json({ error: "Elige el documento a generar: informe o acta." }, { status: 400 });
  }
  const docTypes = docTypesFromSelection(selection);

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

  // Todo lo que decide cuántas filas se crean (cupo, idempotencia, lista de trabajo) y la creación misma van en UNA
  // transacción con un candado por usuario. Antes era leer-y-luego-escribir: K lotes simultáneos leían el mismo cupo restante
  // y cada uno creaba hasta N pendientes (K×N generaciones de IA de pago contra el tope mensual). El candado de asesoría
  // (pg_advisory_xact_lock) se libera al confirmar, así que el siguiente lote del mismo usuario ya ve las filas del anterior.
  const doneKey = selection.kind === "acta" ? "actaHtml" : "informeHtml";
  type Resultado =
    | { tipo: "ajeno" }
    | { tipo: "vacio"; skippedNoData: number; skippedExisting: number; skippedCap: number }
    | { tipo: "ok"; batchId: string; created: number; skippedNoData: number; skippedExisting: number; skippedCap: number };

  const resultado: Resultado = await db.$transaction(
    async (tx): Promise<Resultado> => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"empresa-batch:" + elite.userId}))`;

      // Staged data (only ready properties get generated).
      const staged = await tx.propertyMonthlyData.findMany({
        where: { userId: elite.userId, month, year, propertyId: { in: ownedIds } },
        select: { propertyId: true, files: true, additionalText: true },
      });
      const stagedByProp = new Map(staged.map((s) => [s.propertyId, s]));

      // Idempotencia POR TIPO DE DOCUMENTO. Antes solo miraba mes+año+completada,
      // así que un lote de ACTAS de agosto saltaba todas las propiedades que ya
      // tenían INFORME de agosto y respondía "ninguna propiedad quedó lista": el
      // lote de actas era literalmente imposible sin marcar "regenerar", que a su
      // vez rehace informes que nadie quiso tocar.
      // Se mira `outputFiles` y no `type`, porque las filas de lote se crean todas
      // con type:"custom" y el tipo real solo vive en GenerationBatch.docTypes.
      const already = regenerate
        ? []
        : await tx.generation.findMany({
            where: { userId: elite.userId, month, year, status: "completed", propertyId: { in: ownedIds } },
            select: { propertyId: true, outputFiles: true },
          });
      const alreadySet = new Set(
        already
          .filter((a) => !!(a.outputFiles as Record<string, string> | null)?.[doneKey])
          .map((a) => a.propertyId)
      );

      // Las pendientes o en proceso del mismo mes y del mismo documento tampoco se duplican (ni con "regenerar"): aún no
      // están completadas, pero ya van a gastar cupo y a procesarse. El tipo vive en el lote (`docTypes`), no en la fila.
      const enCurso = await tx.generation.findMany({
        where: { userId: elite.userId, month, year, status: { in: ["pending", "processing"] }, propertyId: { in: ownedIds } },
        select: { propertyId: true, batchId: true },
      });
      const idsLote = [...new Set(enCurso.map((g) => g.batchId).filter((b): b is string => !!b))];
      if (idsLote.length > 0) {
        const lotes = await tx.generationBatch.findMany({
          where: { id: { in: idsLote }, userId: elite.userId, docTypes: { has: selection.kind } },
          select: { id: true },
        });
        const lotesDelTipo = new Set(lotes.map((l) => l.id));
        for (const g of enCurso) if (g.batchId && lotesDelTipo.has(g.batchId)) alreadySet.add(g.propertyId);
      }

      // Tope mensual del Élite real (beta/demo no tienen). Es la MISMA regla que usa el reintento del lote (lib/generation/cupo-lote.ts):
      // el mes se mide en hora de Bogotá, no en la del servidor (UTC en Vercel, donde el mes cambiaba a las 7 p. m. del último día).
      // Se lee DENTRO del candado: el lote anterior ya confirmó sus filas pendientes.
      let remaining = Infinity;
      if (elite.plan === "elite") {
        remaining = await cupoMensualRestante(elite.userId);
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

      if (capped.length === 0) return { tipo: "vacio", skippedNoData, skippedExisting, skippedCap };

      // Los insumos preparados se encolan tal cual y el trabajador (cron) los lee con la credencial del servidor y se los entrega a
      // la IA: deben ser de quien lanza el lote (`subidas/<su id>/…`) o, para lo guardado antes, de la carpeta mensual de ESA
      // propiedad (ya verificada como suya arriba). Se comprueba antes de crear nada: ni lote ni filas pendientes si alguno no lo es.
      // El PUT que los prepara ya lo exige; esto cubre filas de antes de esa regla o escritas por otro camino.
      for (const c of capped) {
        if (primerBlobAjeno(c.files, elite.userId, { propertyId: c.propertyId })) return { tipo: "ajeno" };
      }

      const batch = await tx.generationBatch.create({
        data: { userId: elite.userId, month, year, docTypes, status: "processing", total: capped.length },
      });

      await tx.generation.createMany({
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

      return { tipo: "ok", batchId: batch.id, created: capped.length, skippedNoData, skippedExisting, skippedCap };
    },
    { timeout: 20_000, maxWait: 10_000 }
  );

  if (resultado.tipo === "ajeno") {
    return NextResponse.json({ error: MENSAJE_INSUMO_AJENO }, { status: 403 });
  }
  if (resultado.tipo === "vacio") {
    return NextResponse.json({
      error: "Ninguna propiedad quedó lista para generar.",
      skippedNoData: resultado.skippedNoData,
      skippedExisting: resultado.skippedExisting,
      skippedCap: resultado.skippedCap,
    }, { status: 400 });
  }

  return NextResponse.json({
    batchId: resultado.batchId,
    created: resultado.created,
    skippedNoData: resultado.skippedNoData,
    skippedExisting: resultado.skippedExisting,
    skippedCap: resultado.skippedCap,
    docTypes: selection,
  });
}
