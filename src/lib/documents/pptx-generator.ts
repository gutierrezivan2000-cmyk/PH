import PptxGenJS from "pptxgenjs";

// Re-export types and parser from the safe module (no heavy deps)
export type { SlideData, PresentationData } from "./slide-parser";
export { parseMarkdownToSlides } from "./slide-parser";

import type { PresentationData } from "./slide-parser";

const COLORS = {
  primary: "1E40AF",
  secondary: "3B82F6",
  accent: "60A5FA",
  dark: "1E293B",
  light: "F8FAFC",
  white: "FFFFFF",
  text: "334155",
};

export async function generatePptx(data: PresentationData): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.author = "SOPH.IA";
  pptx.subject = data.title;
  pptx.title = `${data.title} - ${data.propertyName}`;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { fill: COLORS.primary };
  titleSlide.addText(data.title, {
    x: 0.5,
    y: 1.5,
    w: 9,
    h: 1.5,
    fontSize: 36,
    bold: true,
    color: COLORS.white,
    align: "center",
  });
  titleSlide.addText(data.subtitle, {
    x: 0.5,
    y: 3.2,
    w: 9,
    h: 0.8,
    fontSize: 18,
    color: COLORS.accent,
    align: "center",
  });
  titleSlide.addText(
    new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long" }),
    {
      x: 0.5,
      y: 4.2,
      w: 9,
      h: 0.5,
      fontSize: 14,
      color: COLORS.light,
      align: "center",
    }
  );

  // Content slides
  for (const slideData of data.slides) {
    const slide = pptx.addSlide();

    // Header bar
    slide.addShape("rect" as PptxGenJS.ShapeType, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.8,
      fill: { color: COLORS.primary },
    });

    // Slide title
    slide.addText(slideData.title, {
      x: 0.5,
      y: 0.1,
      w: 9,
      h: 0.6,
      fontSize: 20,
      bold: true,
      color: COLORS.white,
    });

    if (slideData.bullets && slideData.bullets.length > 0) {
      // Limit bullets per slide
      const maxBullets = 8;
      const visibleBullets = slideData.bullets.slice(0, maxBullets);

      const bulletText = visibleBullets.map((b) => ({
        text: b,
        options: {
          fontSize: 14,
          color: COLORS.text,
          bullet: { characterCode: "2022" },
          breakLine: true as const,
          paraSpaceAfter: 6,
        },
      }));

      slide.addText(bulletText, {
        x: 0.5,
        y: 1.2,
        w: 9,
        h: 4.5,
        valign: "top",
      });
    } else if (slideData.content) {
      slide.addText(slideData.content.substring(0, 500), {
        x: 0.5,
        y: 1.2,
        w: 9,
        h: 4.5,
        fontSize: 14,
        color: COLORS.text,
        valign: "top",
      });
    }

    // Footer
    slide.addText(`${data.propertyName} | ${data.period}`, {
      x: 0.5,
      y: 5.2,
      w: 9,
      h: 0.3,
      fontSize: 9,
      color: "94A3B8",
      align: "right",
    });
  }

  // Thank you slide
  const endSlide = pptx.addSlide();
  endSlide.background = { fill: COLORS.primary };
  endSlide.addText("Gracias", {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1.5,
    fontSize: 40,
    bold: true,
    color: COLORS.white,
    align: "center",
  });
  endSlide.addText(data.propertyName, {
    x: 0.5,
    y: 3.5,
    w: 9,
    h: 0.8,
    fontSize: 18,
    color: COLORS.accent,
    align: "center",
  });

  // Generate the PPTX binary — try multiple output strategies for serverless compat
  console.log(`[pptx-generator] Writing PPTX with ${data.slides.length} content slides...`);

  let buffer: Buffer;
  try {
    const output = await pptx.write({ outputType: "nodebuffer" });
    buffer = Buffer.isBuffer(output) ? output : Buffer.from(output as ArrayBuffer);
  } catch (e) {
    console.warn("[pptx-generator] nodebuffer failed:", e instanceof Error ? e.message : String(e));
    try {
      const output = await pptx.write({ outputType: "uint8array" });
      buffer = Buffer.from(output as Uint8Array);
    } catch (e2) {
      console.warn("[pptx-generator] uint8array failed:", e2 instanceof Error ? e2.message : String(e2));
      // Last resort: base64
      const output = await pptx.write({ outputType: "base64" });
      buffer = Buffer.from(output as string, "base64");
    }
  }

  console.log(`[pptx-generator] PPTX buffer ready: ${buffer.length} bytes, isBuffer: ${Buffer.isBuffer(buffer)}`);

  if (buffer.length === 0) {
    throw new Error("PPTX generation produced empty buffer");
  }

  return buffer;
}
