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

export function parseMarkdownToSlides(
  markdown: string,
  propertyName: string,
  period: string
): PresentationData {
  const sections = markdown.split(/^## /gm).filter(Boolean);
  const slides: SlideData[] = [];

  for (const section of sections) {
    const lines = section.trim().split("\n");
    const sectionTitle =
      lines[0]?.replace(/^\*\*|\*\*$/g, "").trim() ?? "";
    const body = lines.slice(1).join("\n").trim();

    if (!sectionTitle) continue;

    const bullets = body
      .split("\n")
      .map((line) =>
        line
          .replace(/^[-*]\s*/, "")
          .replace(/^\d+\.\s*/, "")
          .replace(/\*\*/g, "")
          .trim()
      )
      .filter((line) => line.length > 0);

    slides.push({
      title: sectionTitle,
      bullets: bullets.length > 0 ? bullets : undefined,
      content: bullets.length === 0 ? body : undefined,
      type: "content",
    });
  }

  return {
    title: "Informe de Gestión",
    subtitle: `${propertyName} | ${period}`,
    propertyName,
    period,
    slides,
  };
}
