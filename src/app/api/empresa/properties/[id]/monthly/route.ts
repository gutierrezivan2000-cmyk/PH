export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireElite } from "@/lib/elite-auth";
import { db } from "@/lib/db";
import { isAllowedBlobUrl } from "@/lib/blob-url";
import { MENSAJE_BLOB_AJENO, blobAutorizado } from "@/lib/blob-owner";
import { borrarBlobsPropios } from "@/lib/blob-owner-server";

type FileRef = { name: string; url: string; type: string; size: number };

function parseMonthYear(req: NextRequest): { month: number; year: number } | null {
  const month = parseInt(req.nextUrl.searchParams.get("month") || "", 10);
  const year = parseInt(req.nextUrl.searchParams.get("year") || "", 10);
  if (!month || !year || month < 1 || month > 12 || year < 2020 || year > 2100) return null;
  return { month, year };
}

/** Returns the staged monthly inputs for a property (files + notes). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json({ files: [], additionalText: "" });
  }

  const { id } = await params;
  const my = parseMonthYear(req);
  if (!my) return NextResponse.json({ error: "month y year requeridos" }, { status: 400 });

  // Ownership: the property must belong to the caller.
  const property = await db.property.findFirst({ where: { id, userId: elite.userId }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });

  const data = await db.propertyMonthlyData.findUnique({
    where: { propertyId_month_year: { propertyId: id, month: my.month, year: my.year } },
  });

  return NextResponse.json({
    files: (data?.files as FileRef[] | null) ?? [],
    additionalText: data?.additionalText ?? "",
  });
}

/** Upserts the staged monthly inputs for a property. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const elite = await requireElite();
  if (!elite) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (process.env.DEMO_MODE === "true") {
    return NextResponse.json(
      { error: "La generación en lote no está disponible en el demo. Crea tu cuenta para usarla." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const month = parseInt(String(body.month), 10);
  const year = parseInt(String(body.year), 10);
  if (!month || !year || month < 1 || month > 12 || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "month y year inválidos" }, { status: 400 });
  }

  const property = await db.property.findFirst({ where: { id, userId: elite.userId }, select: { id: true } });
  if (!property) return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });

  // Validate files: array, allowlisted blob hosts only (anti-SSRF), cap count.
  const rawFiles = Array.isArray(body.files) ? body.files : [];
  if (rawFiles.length > 20) {
    return NextResponse.json({ error: "Máximo 20 archivos por propiedad." }, { status: 400 });
  }
  const files: FileRef[] = [];
  for (const f of rawFiles) {
    if (!f || typeof f.url !== "string" || !isAllowedBlobUrl(f.url)) {
      return NextResponse.json({ error: "Archivo con origen no permitido." }, { status: 400 });
    }
    // Los insumos del mes los lee después el trabajador de lotes y se pasan a la IA: deben ser de esta persona
    // (`subidas/<su id>/…`). La pantalla reenvía en cada guardado TODA la lista, incluidos los archivos que ya estaban
    // guardados antes de que el dueño fuera parte de la ruta (`monthly/<esta copropiedad>/…`): esos se reconocen por la
    // copropiedad, que ya se comprobó que es suya arriba. Archivos NUEVOS con esa ruta no se pueden crear (el token no la emite).
    if (!blobAutorizado(f.url, elite.userId, { propertyId: id })) {
      return NextResponse.json({ error: MENSAJE_BLOB_AJENO }, { status: 403 });
    }
    files.push({
      name: String(f.name || "archivo"),
      url: f.url,
      type: String(f.type || "application/octet-stream"),
      size: Number(f.size) || 0,
    });
  }

  const additionalText = typeof body.additionalText === "string" ? body.additionalText.slice(0, 20000) : "";

  // Delete blobs the user removed from the staging list (avoid orphans).
  try {
    const existing = await db.propertyMonthlyData.findUnique({
      where: { propertyId_month_year: { propertyId: id, month, year } },
      select: { files: true },
    });
    const oldUrls = ((existing?.files as FileRef[] | null) ?? []).map((f) => f.url);
    const newUrls = new Set(files.map((f) => f.url));
    const removed = oldUrls.filter((u) => !newUrls.has(u));
    if (removed.length > 0) {
      // Solo se borra lo que es de esta persona y no es documento de una copropiedad: la lista guardada
      // también salió de una petición del navegador, y no hay que fiarse de ella para borrar.
      await borrarBlobsPropios(removed, elite.userId, { propertyId: id, etiqueta: "monthly PUT" });
    }
  } catch (e) {
    console.error("[monthly PUT] blob cleanup failed:", e);
  }

  await db.propertyMonthlyData.upsert({
    where: { propertyId_month_year: { propertyId: id, month, year } },
    create: { propertyId: id, userId: elite.userId, month, year, files, additionalText },
    update: { files, additionalText },
  });

  return NextResponse.json({ ok: true, count: files.length });
}
