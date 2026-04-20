export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";

const IS_DEMO = process.env.DEMO_MODE === "true";

const REFINE_SYSTEM_PROMPT = `Eres un asistente de edicion de documentos de Propiedad Horizontal. Tu tarea es corregir o complementar un documento existente segun las instrucciones del usuario.

REGLAS:
1. Manten el formato, estructura y estilo del documento original.
2. Solo modifica, agrega o elimina lo que el usuario pide. No cambies el resto.
3. Si la instruccion NO aplica a este tipo de documento, devuelve el documento exactamente como esta, sin ningun cambio.
4. Si el usuario pide agregar informacion, integrala naturalmente en la seccion correspondiente.
5. Si el usuario pide corregir algo, hazlo puntualmente sin alterar el resto.
6. Manten el tono profesional y formal del documento original.
7. Responde SOLO con el documento corregido completo en Markdown. Sin explicaciones.
8. NUNCA inventes datos que el usuario no haya proporcionado en su instruccion.`;

interface DocToRefine {
  type: "informe" | "acta";
  content: string;
  sourceType: "markdown" | "html";
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { generationId, instruction } = body;
    const blobFiles: { url: string; name: string; type: string; size: number }[] = Array.isArray(body.blobFiles) ? body.blobFiles : [];

    if (!generationId || !instruction?.trim()) {
      return NextResponse.json({ error: "generationId e instruccion requeridos" }, { status: 400 });
    }

    // Parse any additional uploaded files into text context
    let additionalContent = "";
    if (blobFiles.length > 0) {
      const fileParts: string[] = [];
      for (const ref of blobFiles) {
        try {
          const { get: getBlob } = await import("@vercel/blob");
          const result = await getBlob(ref.url, { access: "private" }).catch(() => null);
          if (!result) continue;
          const buffer = await new Response(result.stream).arrayBuffer();
          const file = new File([buffer], ref.name, { type: ref.type || "application/octet-stream" });
          if (file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
            fileParts.push(`[Archivo adicional: ${file.name}]\n${await file.text()}`);
          } else {
            const { consolidateFiles } = await import("@/lib/parsers");
            const parsed = await consolidateFiles([file]);
            fileParts.push(parsed);
          }
        } catch (e) {
          console.error(`[generate/refine] Failed to parse ${ref.name}:`, e);
        }
      }
      if (fileParts.length > 0) {
        additionalContent = "\n\nINFORMACION ADICIONAL DE ARCHIVOS SUBIDOS:\n---\n" + fileParts.join("\n\n---\n\n");
      }
    }

    let outputFiles: Record<string, string> | null = null;
    let propertyName = "";
    let month = 0;
    let year = 0;

    if (IS_DEMO) {
      const { getGenerationById, DEMO_USER } = await import("@/lib/demo-store");
      const gen = getGenerationById(generationId, DEMO_USER.id);
      if (!gen) return NextResponse.json({ error: "Generacion no encontrada" }, { status: 404 });
      outputFiles = gen.outputFiles as Record<string, string> | null;
      propertyName = (gen.property as { name: string })?.name || "Propiedad";
      month = gen.month;
      year = gen.year;
    } else {
      const { db } = await import("@/lib/db");
      const gen = await db.generation.findFirst({
        where: { id: generationId, userId: session.user.id },
        include: { property: true },
      });
      if (!gen) return NextResponse.json({ error: "Generacion no encontrada" }, { status: 404 });
      outputFiles = gen.outputFiles as Record<string, string> | null;
      propertyName = gen.property.name;
      month = gen.month;
      year = gen.year;
    }

    const { get } = await import("@vercel/blob");

    // Collect all existing documents to correct
    const docs: DocToRefine[] = [];

    // Informe — prefer markdown, fall back to HTML
    if (outputFiles?.informeMarkdown || outputFiles?.informeHtml) {
      let content = "";
      let sourceType: "markdown" | "html" = "html";
      if (outputFiles.informeMarkdown) {
        const blob = await get(outputFiles.informeMarkdown, { access: "private" }).catch(() => null);
        if (blob) {
          content = await new Response(blob.stream).text();
          sourceType = "markdown";
        }
      }
      if (!content && outputFiles.informeHtml) {
        const blob = await get(outputFiles.informeHtml, { access: "private" }).catch(() => null);
        if (blob) {
          content = await new Response(blob.stream).text();
          sourceType = "html";
        }
      }
      if (content) docs.push({ type: "informe", content, sourceType });
    }

    // Acta — prefer markdown, fall back to HTML
    if (outputFiles?.actaMarkdown || outputFiles?.actaHtml) {
      let content = "";
      let sourceType: "markdown" | "html" = "html";
      if (outputFiles.actaMarkdown) {
        const blob = await get(outputFiles.actaMarkdown, { access: "private" }).catch(() => null);
        if (blob) {
          content = await new Response(blob.stream).text();
          sourceType = "markdown";
        }
      }
      if (!content && outputFiles.actaHtml) {
        const blob = await get(outputFiles.actaHtml, { access: "private" }).catch(() => null);
        if (blob) {
          content = await new Response(blob.stream).text();
          sourceType = "html";
        }
      }
      if (content) docs.push({ type: "acta", content, sourceType });
    }

    if (docs.length === 0) {
      return NextResponse.json({ error: "No se encontraron documentos para corregir" }, { status: 404 });
    }

    // Correct all documents in parallel
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const results = await Promise.all(docs.map(async (doc) => {
      const docLabel = doc.type === "informe" ? "Informe de Gestion" : "Acta Legal";
      const userPrompt = `DOCUMENTO ORIGINAL (${doc.sourceType === "markdown" ? "Markdown" : "HTML"}, tipo: ${docLabel}):\n---\n${doc.content}\n---\n\nINSTRUCCION DEL USUARIO:\n${instruction}${additionalContent}\n\nSi la instruccion o la informacion adicional aplica a este documento (${docLabel}), integra los cambios solicitados. Si NO aplica a este tipo de documento, devuelve el documento exactamente como esta.\n\nDevuelve el documento COMPLETO en formato Markdown.`;

      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 16384,
        temperature: 0.15,
        system: REFINE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const tokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      return { type: doc.type, text, tokens };
    }));

    // Build period string
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const period = `${monthNames[month - 1]} ${year}`;

    // Generate HTML and upload all corrected documents
    const { put } = await import("@vercel/blob");
    const newUrls: Record<string, string> = { ...outputFiles };
    const uploads: Promise<void>[] = [];
    let totalTokens = 0;
    const updatedDocs: string[] = [];

    for (const result of results) {
      if (!result.text.trim()) continue;
      totalTokens += result.tokens;
      updatedDocs.push(result.type);

      const html = generatePdfHtml({
        title: result.type === "acta" ? "Acta de Reunion" : "Informe de Gestion",
        propertyName,
        period,
        content: result.text,
        type: result.type,
      });

      const blobKey = result.type === "acta" ? "actaHtml" : "informeHtml";
      uploads.push(
        put(`generations/${generationId}/${result.type}.html`, html, { access: "private", contentType: "text/html", addRandomSuffix: true })
          .then((blob) => { newUrls[blobKey] = blob.url; })
      );

      // Save updated markdown
      const mdKey = result.type === "acta" ? "actaMarkdown" : "informeMarkdown";
      uploads.push(
        put(`generations/${generationId}/${result.type}.md`, result.text, { access: "private", contentType: "text/markdown", addRandomSuffix: true })
          .then((blob) => { newUrls[mdKey] = blob.url; })
      );
    }

    // Delete stale PPTX if informe was corrected — it will auto-regenerate
    if (updatedDocs.includes("informe")) {
      delete newUrls.presentacionPptx;
    }

    await Promise.all(uploads);

    // Re-analyze acta requirements if acta was corrected
    const actaResult = results.find((r) => r.type === "acta");
    if (actaResult?.text.trim()) {
      try {
        const { analyzeActaRequirements } = await import("@/lib/ai/acta-requirements");
        const requirements = await analyzeActaRequirements(actaResult.text);
        newUrls.actaRequirements = JSON.stringify(requirements);
      } catch (e) {
        console.error("[generate/refine] Acta requirements analysis failed:", e);
      }
    }

    // Update DB + record usage
    if (!IS_DEMO) {
      const { db } = await import("@/lib/db");
      await db.generation.update({
        where: { id: generationId },
        data: { outputFiles: newUrls },
      });

      try {
        const { recordUsage } = await import("@/lib/usage");
        const costUsd = totalTokens * 0.000003;
        await recordUsage(session.user.id, totalTokens, costUsd, "correccion");
      } catch (e) {
        console.error("[generate/refine] Usage recording failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      documentsUpdated: updatedDocs,
      tokensUsed: totalTokens,
    });
  } catch (e) {
    console.error("[generate/refine] Error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: `Error al corregir: ${msg}` }, { status: 500 });
  }
}
