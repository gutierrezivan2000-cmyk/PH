export const runtime = "nodejs";
export const maxDuration = 300;

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";

// Demo-mode imports (lightweight, no heavy native deps)
import {
  DEMO_USER,
  createGeneration,
  updateGeneration,
  getPropertyById,
  checkUsageLimitDemo,
  saveFileBuffers,
} from "@/lib/demo-store";
import { getMockInforme, getMockActa } from "@/lib/mock-ai";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";
import { STRATEGOS_SYSTEM_PROMPT, buildStrategosPrompt } from "@/lib/ai/strategos";
import { GRAMMATEUS_SYSTEM_PROMPT, buildGrammatusPrompt } from "@/lib/ai/grammateus";
import { blobRefToFile, runGeneration, type BlobFileRef } from "@/lib/generation/run";

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (IS_DEMO) {
      return handleDemo(req);
    }

    const user = session.user!;
    return handleProduction(req, {
      user: { id: user.id!, email: user.email, name: user.name, image: user.image },
    });
  } catch (error) {
    console.error("[generate/full] Unhandled error:", error);
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json(
      { error: `Error interno del servidor: ${msg}` },
      { status: 500 }
    );
  }
}

// ── DEMO MODE ────────────────────────────────────────────────────────────────
async function handleDemo(req: NextRequest) {
  const body = await req.json();
  const propertyId = body.propertyId as string;
  const month = parseInt(String(body.month));
  const year = parseInt(String(body.year));
  const type = (body.type as string) || "custom";
  const demoIncludeInforme = body.includeInforme !== false;
  const demoIncludeActa = body.includeActa === true;
  const demoIncludePptx = body.includePptx === true;
  const additionalText = (body.additionalText as string | undefined) ?? null;
  const blobFiles: BlobFileRef[] = Array.isArray(body.blobFiles) ? body.blobFiles : [];
  const files: File[] = [];
  for (const ref of blobFiles) {
    try {
      files.push(await blobRefToFile(ref));
    } catch (e) {
      console.error("[generate/full] Demo blob fetch failed:", e);
    }
  }

  if (!propertyId || !month || !year) {
    return NextResponse.json(
      { error: "Faltan campos: propertyId, month, year" },
      { status: 400 }
    );
  }

  const property = getPropertyById(propertyId, DEMO_USER.id);
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  const usageCheck = checkUsageLimitDemo(DEMO_USER.id);
  if (!usageCheck.allowed) {
    return NextResponse.json({ error: usageCheck.reason }, { status: 429 });
  }

  const generation = createGeneration({
    userId: DEMO_USER.id,
    propertyId,
    type,
    status: "processing",
    month,
    year,
    inputFiles: files.map((f) => ({ name: f.name, type: f.type })),
    inputText: additionalText,
    outputFiles: null,
    tokensUsed: 0,
    costUsd: 0,
    errorMessage: null,
    property,
  });

  try {
    const months = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${months[month - 1]} ${year}`;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const hasRealAI = !!anthropicKey && !anthropicKey.includes("placeholder") && anthropicKey.length > 10;

    const needInforme = demoIncludeInforme || demoIncludePptx;
    let informeText = "";
    let actaText = "";
    let tokensUsed = 0;

    if (hasRealAI && (files.length > 0 || additionalText?.trim())) {
      const textParts: string[] = [];
      if (additionalText?.trim()) {
        textParts.push(`[Informacion del administrador]\n${additionalText}`);
      }
      for (const file of files) {
        try {
          if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
            textParts.push(`[Archivo: ${file.name}]\n${await file.text()}`);
          } else {
            const { consolidateFiles } = await import("@/lib/parsers");
            const parsed = await consolidateFiles([file]);
            textParts.push(parsed);
          }
        } catch {
          textParts.push(`[Archivo: ${file.name} — no se pudo procesar]`);
        }
      }

      const content = textParts.join("\n\n---\n\n");
      const { generateWithAssistant } = await import("@/lib/ai-client");

      if (needInforme) {
        const prompt = buildStrategosPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(STRATEGOS_SYSTEM_PROMPT, prompt);
        informeText = result.text;
        tokensUsed += result.tokensUsed;
      }

      if (demoIncludeActa) {
        const prompt = buildGrammatusPrompt(property.name, month, year, content);
        const result = await generateWithAssistant(GRAMMATEUS_SYSTEM_PROMPT, prompt);
        actaText = result.text;
        tokensUsed += result.tokensUsed;
      }
    } else {
      informeText = needInforme ? getMockInforme(property.name, month, year) : "";
      actaText = demoIncludeActa ? getMockActa(property.name, month, year) : "";
      tokensUsed = 13840;
    }

    const informeHtml = informeText ? generatePdfHtml({
      title: "Informe de Gestion",
      propertyName: property.name,
      period,
      content: informeText,
      type: "informe",
    }) : undefined;

    const actaHtml = actaText ? generatePdfHtml({
      title: "Acta de Reunion",
      propertyName: property.name,
      period,
      content: actaText,
      type: "acta",
    }) : undefined;

    let pptxBuffer: Buffer | undefined;
    if (informeText && demoIncludePptx) {
      try {
        console.log(`[generate/full] Demo PPTX: informeText length = ${informeText.length}`);
        console.log(`[generate/full] Demo PPTX: first 300 chars:\n${informeText.substring(0, 300)}`);
        const slidesData = parseMarkdownToSlides(informeText, property.name, period);
        console.log(`[generate/full] Demo PPTX: parsed ${slidesData.slides.length} slides`);
        if (slidesData.slides.length > 0) {
          console.log(`[generate/full] Demo PPTX: slide titles: ${slidesData.slides.map(s => s.title).join(" | ")}`);
        }
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        pptxBuffer = await generatePptx(slidesData);
        console.log(`[generate/full] Demo PPTX: generated ${pptxBuffer.length} bytes`);
      } catch (e) {
        console.error("[generate/full] Demo PPTX generation error:", e instanceof Error ? e.stack : String(e));
      }
    } else {
      console.log("[generate/full] Demo PPTX: skipped — no informeText");
    }

    saveFileBuffers(generation.id, {
      informeHtml,
      actaHtml,
      presentacionPptx: pptxBuffer,
    });

    const fileParams = `?p=${encodeURIComponent(property.name)}&m=${month}&y=${year}`;
    const outputFiles: Record<string, string> = {};
    if (informeHtml) outputFiles.informeHtml = `/api/demo/files/${generation.id}/informe${fileParams}`;
    if (actaHtml) outputFiles.actaHtml = `/api/demo/files/${generation.id}/acta${fileParams}`;
    if (pptxBuffer) outputFiles.presentacionPptx = `/api/demo/files/${generation.id}/pptx${fileParams}`;

    // Analyze acta for missing legal requirements
    if (actaText && hasRealAI) {
      try {
        const { analyzeActaRequirements } = await import("@/lib/ai/acta-requirements");
        const requirements = await analyzeActaRequirements(actaText);
        outputFiles.actaRequirements = JSON.stringify(requirements);
      } catch (e) {
        console.error("[generate/full] Demo acta requirements analysis failed:", e);
      }
    }

    const costUsd = hasRealAI ? tokensUsed * 0.000015 : 0.19;

    updateGeneration(generation.id, {
      status: "completed",
      outputFiles,
      tokensUsed,
      costUsd,
      completedAt: new Date(),
    });

    return NextResponse.json({
      id: generation.id,
      status: "completed",
      outputFiles,
      tokensUsed,
      costUsd,
      month,
      year,
      type,
      property: { name: property.name },
      createdAt: generation.createdAt.toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[generate/full] Demo generation error:", error);
    const msg = error instanceof Error ? error.message : "Error desconocido";
    updateGeneration(generation.id, { status: "failed", errorMessage: msg });
    return NextResponse.json({ error: `Error al generar: ${msg}` }, { status: 500 });
  }
}

// ── PRODUCTION MODE — background processing with after() ─────────────────────
async function handleProduction(req: NextRequest, session: { user: { id: string; email?: string | null; name?: string | null; image?: string | null } }) {
  // Step 1: Import DB
  let db: Awaited<typeof import("@/lib/db")>["db"];
  try {
    ({ db } = await import("@/lib/db"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Error DB: ${msg.slice(0, 200)}` }, { status: 500 });
  }

  // Step 2: Ensure user exists
  let dbUserId = session.user.id;
  try {
    if (session.user.email) {
      const existing = await db.user.findUnique({ where: { email: session.user.email } });
      if (existing) {
        dbUserId = existing.id;
      } else {
        const created = await db.user.create({
          data: { email: session.user.email, name: session.user.name, image: session.user.image },
        });
        dbUserId = created.id;
      }
    }
  } catch (e) {
    console.error("[generate/full] User sync error:", e);
  }

  // Step 3: Parse JSON body with blob URL references
  let body: {
    propertyId?: string;
    month?: number | string;
    year?: number | string;
    type?: string;
    includeInforme?: boolean;
    includeActa?: boolean;
    includePptx?: boolean;
    additionalText?: string | null;
    blobFiles?: BlobFileRef[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Cuerpo invalido. Se esperaba JSON con blobFiles." },
      { status: 400 }
    );
  }

  const propertyId = body.propertyId ?? "";
  const month = parseInt(String(body.month ?? ""));
  const year = parseInt(String(body.year ?? ""));
  const additionalText = body.additionalText ?? null;
  const type = body.type || "custom";
  const includeInforme = body.includeInforme !== false;
  const includeActa = body.includeActa === true;
  const includePptx = body.includePptx === true;
  const blobFiles: BlobFileRef[] = Array.isArray(body.blobFiles) ? body.blobFiles : [];

  if (!propertyId || !month || !year) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // Enforce per-plan file caps (trial: 5 files/10 MB; paid: 20 files/25 MB).
  // The count is authoritative; the declared size is a best-effort early reject
  // on top of the hard 25 MB cap enforced by the upload token.
  try {
    const { getGenerationFileLimits } = await import("@/lib/usage");
    const fileLimits = await getGenerationFileLimits(dbUserId);
    if (blobFiles.length > fileLimits.maxFiles) {
      return NextResponse.json(
        { error: `Tu plan permite hasta ${fileLimits.maxFiles} archivos por generación.` },
        { status: 400 }
      );
    }
    const oversized = blobFiles.find((f) => f.size > fileLimits.maxFileSizeMb * 1024 * 1024);
    if (oversized) {
      return NextResponse.json(
        { error: `El archivo "${oversized.name}" supera el límite de ${fileLimits.maxFileSizeMb} MB de tu plan.` },
        { status: 400 }
      );
    }
  } catch (e) {
    console.error("[generate/full] file-limit check failed:", e);
  }

  // Step 4: Check usage limits
  try {
    const { checkUsageLimits } = await import("@/lib/usage");
    const usageCheck = await checkUsageLimits(dbUserId);
    if (!usageCheck.allowed) {
      return NextResponse.json({
        error: usageCheck.reason,
        dailyUsed: usageCheck.dailyUsed,
        monthlyUsed: usageCheck.monthlyUsed,
      }, { status: 429 });
    }
  } catch (e) {
    console.error("[generate/full] Usage check failed:", e);
  }

  // Step 5: Find property
  const property = await db.property.findFirst({ where: { id: propertyId, userId: dbUserId } });
  if (!property) {
    return NextResponse.json({ error: "Propiedad no encontrada" }, { status: 404 });
  }

  // Step 6: Create generation record with "processing" status
  const generation = await db.generation.create({
    data: {
      userId: dbUserId,
      propertyId,
      type,
      status: "processing",
      month,
      year,
      inputFiles: blobFiles.map((f) => ({ name: f.name, type: f.type, size: f.size, url: f.url })),
      inputText: additionalText,
    },
  });

  // ═══ RESPOND IMMEDIATELY — the heavy AI work runs in the background via
  // the shared runGeneration worker (also used by the enterprise batch cron).
  after(() =>
    runGeneration({
      generationId: generation.id,
      userId: dbUserId,
      propertyName: property.name,
      month,
      year,
      blobFiles,
      additionalText,
      includeInforme,
      includeActa,
      includePptx,
      cleanupInputs: true,
    })
  );

  // Return immediately with the generation ID — client will poll for status
  return NextResponse.json({
    id: generation.id,
    status: "processing",
    month,
    year,
    type,
    property: { name: property.name },
  });
}
