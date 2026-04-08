export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFileBuffers } from "@/lib/demo-store";
import { getMockInforme, getMockActa } from "@/lib/mock-ai";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { generatePptx, parseMarkdownToSlides } from "@/lib/documents/pptx-generator";

// Pre-baked content for seeded historical generations
const SEEDED_CONTENT: Record<string, { month: number; year: number }> = {
  "gen-demo-feb-001": { month: 2, year: 2026 },
  "gen-demo-jan-001": { month: 1, year: 2026 },
};

const PROPERTY_NAME = "Conjunto Residencial Los Pinos";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ generationId: string; fileType: string }> }
) {
  const { generationId, fileType } = await params;

  // Try live buffers first (from a just-completed generation)
  let buffers = getFileBuffers(generationId);

  // For seeded historical generations, build content on the fly
  if (!buffers && SEEDED_CONTENT[generationId]) {
    const { month, year } = SEEDED_CONTENT[generationId];
    const months = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${months[month - 1]} ${year}`;
    const informeText = getMockInforme(PROPERTY_NAME, month, year);
    const actaText = getMockActa(PROPERTY_NAME, month, year);

    let pptxBuffer: Buffer | undefined;
    if (fileType === "pptx") {
      const slidesData = parseMarkdownToSlides(informeText, PROPERTY_NAME, period);
      pptxBuffer = await generatePptx(slidesData);
    }

    buffers = {
      informeHtml: generatePdfHtml({
        title: "Informe de Gestion",
        propertyName: PROPERTY_NAME,
        period,
        content: informeText,
        type: "informe",
      }),
      actaHtml: generatePdfHtml({
        title: "Acta de Reunion",
        propertyName: PROPERTY_NAME,
        period,
        content: actaText,
        type: "acta",
      }),
      presentacionPptx: pptxBuffer,
    };
  }

  if (!buffers) {
    return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  }

  if (fileType === "informe" && buffers.informeHtml) {
    return new NextResponse(buffers.informeHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (fileType === "acta" && buffers.actaHtml) {
    return new NextResponse(buffers.actaHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (fileType === "pptx") {
    let pptx = buffers.presentacionPptx;
    if (!pptx && buffers.informeHtml) {
      // Generate PPTX on the fly from HTML isn't possible, but we can re-generate
      // This path is reached when the buffer was created without PPTX
    }
    if (pptx) {
      return new NextResponse(pptx.buffer as ArrayBuffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename="presentacion-${generationId}.pptx"`,
        },
      });
    }
  }

  return NextResponse.json({ error: "Tipo de archivo no valido" }, { status: 400 });
}
