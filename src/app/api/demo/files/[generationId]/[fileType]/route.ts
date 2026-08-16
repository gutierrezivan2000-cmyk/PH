export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFileBuffers } from "@/lib/demo-store";
import { getMockInforme, getMockActa } from "@/lib/mock-ai";
import { generatePdfHtml } from "@/lib/documents/pdf-generator";
import { parseMarkdownToSlides } from "@/lib/documents/slide-parser";

// Pre-baked content for seeded historical generations
const SEEDED_CONTENT: Record<string, { month: number; year: number }> = {
  "gen-demo-feb-001": { month: 2, year: 2026 },
  "gen-demo-jan-001": { month: 1, year: 2026 },
};

const PROPERTY_NAME = "Conjunto Residencial Los Pinos";

/**
 * Documentos de la copropiedad que el portal del residente enlaza en su sección
 * "Documentos" (ver getDemoDocuments en demo-store). Sin esto la ruta solo
 * conocía ids de GENERACIÓN, así que al pulsar "Abrir" el residente recibía
 * {"error":"Archivo no encontrado"} en JSON — comprobado con curl.
 */
const SEEDED_DOCS: Record<string, { title: string; body: string }> = {
  "doc-demo-1": {
    title: "Reglamento de propiedad horizontal",
    body: `## Capítulo I — Objeto y ámbito

**Artículo 1.** El presente reglamento regula las relaciones entre los copropietarios del Conjunto Residencial Los Pinos, sometido al régimen de propiedad horizontal de la Ley 675 de 2001.

**Artículo 2.** Son bienes comunes las zonas verdes, el salón comunal, la piscina, los parqueaderos de visitantes, las porterías, los ascensores y las redes de servicios públicos hasta el punto de acometida de cada unidad privada.

## Capítulo II — Obligaciones de los propietarios

**Artículo 8.** Pagar oportunamente las expensas comunes necesarias, en proporción al coeficiente de copropiedad, dentro de los diez (10) primeros días de cada mes.

**Artículo 9.** Usar los bienes comunes conforme a su destinación, sin restringir el derecho de los demás copropietarios.

**Artículo 12.** Responder por los daños causados a los bienes comunes por sí, por su familia, sus visitantes o sus arrendatarios.

## Capítulo III — Uso de zonas comunes

**Artículo 20.** El salón comunal se reserva con mínimo tres (3) días de antelación ante la administración y su uso termina a las 11:00 p.m.

**Artículo 22.** La piscina opera de martes a domingo, de 8:00 a.m. a 6:00 p.m. Los menores de doce (12) años deben estar acompañados por un adulto responsable.`,
  },
  "doc-demo-2": {
    title: "Manual de convivencia",
    body: `## Presentación

Este manual recoge los acuerdos de convivencia del Conjunto Residencial Los Pinos. Complementa el reglamento de propiedad horizontal y se apoya en la Ley 1801 de 2016 (Código Nacional de Seguridad y Convivencia).

## 1. Ruido y horarios

El horario de silencio va de las 10:00 p.m. a las 7:00 a.m. de domingo a jueves, y de las 11:00 p.m. a las 8:00 a.m. viernes y sábados. Las obras y remodelaciones solo se autorizan de lunes a viernes de 8:00 a.m. a 5:00 p.m.

## 2. Mascotas

Las mascotas deben transitar por zonas comunes con collar y correa. El propietario recoge sus excrementos. Las razas señaladas como potencialmente peligrosas requieren bozal y el seguro de responsabilidad civil que exige la ley.

## 3. Basuras y reciclaje

La separación en la fuente es obligatoria. Los residuos se bajan al shut en bolsa cerrada; los voluminosos se coordinan con la administración.

## 4. Parqueaderos

Cada unidad usa el parqueadero asignado en la escritura. Los de visitantes tienen un máximo de doce (12) horas continuas y no pueden usarse como parqueadero permanente de residentes.

## 5. Solución de conflictos

Las diferencias de convivencia se llevan primero al comité de convivencia, conforme al artículo 58 de la Ley 675, antes de acudir a cualquier otra instancia.`,
  },
};

const IS_DEMO = process.env.DEMO_MODE === "true";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ generationId: string; fileType: string }> }
) {
  // Demo-only: this route builds PDFs/PPTX from query params with no auth, so
  // in production it would be an unauthenticated compute sink. 404 when off.
  if (!IS_DEMO) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const { generationId, fileType } = await params;

  const seededDoc = SEEDED_DOCS[generationId];
  if (seededDoc) {
    return new NextResponse(
      generatePdfHtml({
        title: seededDoc.title,
        propertyName: PROPERTY_NAME,
        period: "Documento de ejemplo · modo demo",
        content: seededDoc.body,
        type: "acta",
      }),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  // Try live buffers first (from a just-completed generation in same invocation)
  let buffers = getFileBuffers(generationId);

  // Resolve property name, month, year — from seeded data or query params
  let propertyName: string | null = null;
  let month: number | null = null;
  let year: number | null = null;

  if (SEEDED_CONTENT[generationId]) {
    propertyName = PROPERTY_NAME;
    month = SEEDED_CONTENT[generationId].month;
    year = SEEDED_CONTENT[generationId].year;
  } else {
    // Query params encode the property info for cross-invocation regeneration
    const sp = req.nextUrl.searchParams;
    propertyName = sp.get("p");
    month = sp.has("m") ? parseInt(sp.get("m")!) : null;
    year = sp.has("y") ? parseInt(sp.get("y")!) : null;
  }

  // Generate on-the-fly when buffers aren't available but we have the metadata
  if (!buffers && propertyName && month && year) {
    const months = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
    ];
    const period = `${months[month - 1]} ${year}`;
    const informeText = getMockInforme(propertyName, month, year);
    const actaText = getMockActa(propertyName, month, year);

    let pptxBuffer: Buffer | undefined;
    if (fileType === "pptx") {
      try {
        const slidesData = parseMarkdownToSlides(informeText, propertyName, period);
        const { generatePptx } = await import("@/lib/documents/pptx-generator");
        pptxBuffer = await generatePptx(slidesData);
      } catch {
        // PPTX generation failed
      }
    }

    buffers = {
      informeHtml: generatePdfHtml({
        title: "Informe de Gestion",
        propertyName,
        period,
        content: informeText,
        type: "informe",
      }),
      actaHtml: generatePdfHtml({
        title: "Acta de Reunion",
        propertyName,
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
