export const runtime = "nodejs";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";

const IS_DEMO = process.env.DEMO_MODE === "true";

const REFINE_SYSTEM_PROMPT = `Eres un asistente de edición de documentos de Propiedad Horizontal. Tu tarea es corregir o complementar un documento existente según las instrucciones del usuario.

REGLAS:
1. Mantén el formato, estructura y estilo del documento original.
2. Solo modifica, agrega o elimina lo que el usuario pide. No cambies el resto.
3. Si el usuario pide agregar información, intégrala naturalmente en la sección correspondiente.
4. Si el usuario pide corregir algo, hazlo puntualmente sin alterar el resto.
5. Mantén el tono profesional y formal del documento original.
6. Responde SOLO con el documento corregido completo en Markdown. Sin explicaciones.
7. NUNCA inventes datos que el usuario no haya proporcionado en su instrucción.`;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { generationId, instruction, target } = await req.json();
    if (!generationId || !instruction?.trim()) {
      return NextResponse.json({ error: "generationId e instruccion requeridos" }, { status: 400 });
    }

    const docTarget = target === "acta" ? "acta" : "informe";

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

    // Determine which blob URL to fetch
    const blobKey = docTarget === "acta" ? "actaHtml" : "informeHtml";
    const markdownKey = docTarget === "informe" ? "informeMarkdown" : null;

    // Try to get markdown first (cleaner for re-processing), fall back to HTML
    let originalContent = "";
    let sourceType: "markdown" | "html" = "html";

    if (markdownKey && outputFiles?.[markdownKey]) {
      const { get } = await import("@vercel/blob");
      const blob = await get(outputFiles[markdownKey], { access: "private" }).catch(() => null);
      if (blob) {
        originalContent = await new Response(blob.stream).text();
        sourceType = "markdown";
      }
    }

    if (!originalContent && outputFiles?.[blobKey]) {
      const { get } = await import("@vercel/blob");
      const blob = await get(outputFiles[blobKey], { access: "private" }).catch(() => null);
      if (blob) {
        originalContent = await new Response(blob.stream).text();
        sourceType = "html";
      }
    }

    if (!originalContent) {
      return NextResponse.json({ error: "No se encontro el documento original para corregir" }, { status: 404 });
    }

    // Call AI to refine — use Haiku for economy
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userPrompt = `DOCUMENTO ORIGINAL (${sourceType === "markdown" ? "Markdown" : "HTML"}):\n---\n${originalContent}\n---\n\nINSTRUCCIÓN DEL USUARIO:\n${instruction}\n\nDevuelve el documento COMPLETO corregido en formato Markdown.`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 16384,
      temperature: 0.15,
      system: REFINE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const refinedText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    if (!refinedText.trim()) {
      return NextResponse.json({ error: "La IA no genero contenido corregido" }, { status: 500 });
    }

    // Generate HTML from the refined markdown
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];
    const period = `${monthNames[month - 1]} ${year}`;

    const refinedHtml = generatePdfHtml({
      title: docTarget === "acta" ? "Acta de Reunion" : "Informe de Gestion",
      propertyName,
      period,
      content: refinedText,
      type: docTarget,
    });

    // Upload refined files to blob
    const { put } = await import("@vercel/blob");
    const uploads: Promise<void>[] = [];
    const newUrls: Record<string, string> = { ...outputFiles };

    uploads.push(
      put(`generations/${generationId}/${docTarget === "acta" ? "acta" : "informe"}.html`, refinedHtml, { access: "private", contentType: "text/html" })
        .then((blob) => { newUrls[blobKey] = blob.url; })
    );

    if (docTarget === "informe") {
      uploads.push(
        put(`generations/${generationId}/informe.md`, refinedText, { access: "private", contentType: "text/markdown" })
          .then((blob) => { newUrls.informeMarkdown = blob.url; })
      );
      // Remove stale PPTX so it can be regenerated from updated markdown
      delete newUrls.presentacionPptx;
    }

    await Promise.all(uploads);

    // Update DB
    if (!IS_DEMO) {
      const { db } = await import("@/lib/db");
      await db.generation.update({
        where: { id: generationId },
        data: { outputFiles: newUrls },
      });
    }

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    return NextResponse.json({
      success: true,
      target: docTarget,
      tokensUsed,
    });
  } catch (e) {
    console.error("[generate/refine] Error:", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return NextResponse.json({ error: `Error al corregir: ${msg}` }, { status: 500 });
  }
}
