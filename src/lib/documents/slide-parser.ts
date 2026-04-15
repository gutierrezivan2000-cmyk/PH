// Pure string-based markdown-to-slides parser — no heavy dependencies
// Separated from pptx-generator.ts so it can be imported safely in demo mode

export interface SlideData {
  title: string;
  bullets?: string[];
  content?: string;
  type?: "title" | "content" | "section" | "summary";
}

export interface PresentationData {
  title: string;
  subtitle: string;
  propertyName: string;
  period: string;
  slides: SlideData[];
}

/**
 * Strips markdown code fences (```markdown ... ```) if present.
 */
function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "");
}

/**
 * Extracts sections by splitting on a given header pattern.
 * Returns array of { title, body } or empty if no headers found.
 */
function splitByHeader(
  markdown: string,
  pattern: RegExp
): { title: string; body: string }[] {
  const parts = markdown.split(pattern).filter(Boolean);
  if (parts.length === 0) return [];

  const sections: { title: string; body: string }[] = [];
  for (const part of parts) {
    const lines = part.trim().split("\n");
    const title = lines[0]
      ?.replace(/^#+\s*/, "")
      .replace(/^\*\*|\*\*$/g, "")
      .trim() ?? "";
    const body = lines.slice(1).join("\n").trim();
    if (title) {
      sections.push({ title, body });
    }
  }
  return sections;
}

/**
 * Fallback: split by double newline paragraphs, grouping content into slides.
 */
function splitByParagraphs(markdown: string): { title: string; body: string }[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const slides: { title: string; body: string }[] = [];
  let slideIndex = 1;

  // Group paragraphs into slides of 2-3 paragraphs each
  for (let i = 0; i < paragraphs.length; i += 2) {
    const chunk = paragraphs.slice(i, i + 2);
    const firstLine = chunk[0].split("\n")[0]
      .replace(/^#+\s*/, "")
      .replace(/^\*\*|\*\*$/g, "")
      .replace(/^[-*]\s*/, "")
      .trim();

    // Use the first line as title if it's short enough, otherwise generate one
    const title = firstLine.length > 0 && firstLine.length < 80
      ? firstLine
      : `Sección ${slideIndex}`;

    const body = chunk.join("\n\n");
    slides.push({ title, body });
    slideIndex++;
  }

  return slides;
}

/**
 * Parse bullet lines from a body of text.
 */
function parseBullets(body: string): string[] {
  return body
    .split("\n")
    .map((line) =>
      line
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+\.\s*/, "")
        .replace(/^#{1,4}\s*/, "")
        .replace(/\*\*/g, "")
        .trim()
    )
    .filter((line) => line.length > 0 && line.length < 200);
}

export function parseMarkdownToSlides(
  markdown: string,
  propertyName: string,
  period: string
): PresentationData {
  // Clean the input
  let cleaned = stripCodeFences(markdown.trim());

  // Log first 300 chars for debugging
  console.log(`[slide-parser] Input length: ${cleaned.length} chars`);
  console.log(`[slide-parser] First 300 chars: ${cleaned.substring(0, 300)}`);

  // Try different header patterns in order of preference
  let sections = splitByHeader(cleaned, /^## /gm);
  console.log(`[slide-parser] ## headers: ${sections.length} sections`);

  if (sections.length === 0) {
    sections = splitByHeader(cleaned, /^# /gm);
    console.log(`[slide-parser] # headers: ${sections.length} sections`);
  }

  if (sections.length === 0) {
    sections = splitByHeader(cleaned, /^### /gm);
    console.log(`[slide-parser] ### headers: ${sections.length} sections`);
  }

  // Try numbered sections like "1." or "Paso 1:"
  if (sections.length === 0) {
    sections = splitByHeader(cleaned, /^(?:Paso\s+)?\d+[.:]\s*/gm);
    console.log(`[slide-parser] numbered headers: ${sections.length} sections`);
  }

  // Fallback: split by paragraphs
  if (sections.length === 0) {
    sections = splitByParagraphs(cleaned);
    console.log(`[slide-parser] paragraph fallback: ${sections.length} sections`);
  }

  // Convert sections to slides
  const slides: SlideData[] = [];
  for (const section of sections) {
    const bullets = parseBullets(section.body);

    slides.push({
      title: section.title.substring(0, 100), // Cap title length
      bullets: bullets.length > 0 ? bullets.slice(0, 10) : undefined,
      content: bullets.length === 0 && section.body ? section.body.substring(0, 500) : undefined,
      type: "content",
    });
  }

  // If we STILL have no slides, create one summary slide from the whole text
  if (slides.length === 0 && cleaned.length > 0) {
    console.log("[slide-parser] No sections found at all — creating summary slide");
    slides.push({
      title: "Resumen de Gestión",
      content: cleaned.substring(0, 500),
      type: "summary",
    });
  }

  console.log(`[slide-parser] Final: ${slides.length} slides generated`);

  return {
    title: "Informe de Gestión",
    subtitle: `${propertyName} | ${period}`,
    propertyName,
    period,
    slides,
  };
}
