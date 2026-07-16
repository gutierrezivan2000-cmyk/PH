export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireElite } from "@/lib/elite-auth";
import { db } from "@/lib/db";

type FileRef = { name: string; url: string; type: string; size: number };

function isAllowedBlobUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

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
    files.push({
      name: String(f.name || "archivo"),
      url: f.url,
      type: String(f.type || "application/octet-stream"),
      size: Number(f.size) || 0,
    });
  }

  const additionalText = typeof body.additionalText === "string" ? body.additionalText.slice(0, 20000) : "";

  await db.propertyMonthlyData.upsert({
    where: { propertyId_month_year: { propertyId: id, month, year } },
    create: { propertyId: id, userId: elite.userId, month, year, files, additionalText },
    update: { files, additionalText },
  });

  return NextResponse.json({ ok: true, count: files.length });
}
