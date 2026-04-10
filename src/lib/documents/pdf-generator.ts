// PDF-quality HTML generator for informes and actas
// Converts markdown content to styled HTML documents ready for print-to-PDF

function parseMarkdownTable(tableBlock: string): string {
  const lines = tableBlock.trim().split("\n");
  if (lines.length < 2) return tableBlock;

  const parseRow = (line: string) =>
    line.split("|").map((c) => c.trim()).filter(Boolean);

  const headers = parseRow(lines[0]);
  // Skip separator line (line[1] is |---|---|)
  const bodyLines = lines.slice(2);

  let html = '<table><thead><tr>';
  headers.forEach((h) => {
    html += `<th>${h.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</th>`;
  });
  html += '</tr></thead><tbody>';

  bodyLines.forEach((line) => {
    const cells = parseRow(line);
    if (cells.length === 0) return;
    html += '<tr>';
    cells.forEach((c) => {
      html += `<td>${c.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

export function markdownToSimpleHtml(markdown: string): string {
  // Split into blocks by double newline
  const blocks = markdown.split(/\n\n+/);
  const htmlBlocks: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i].trim();
    if (!block) continue;

    // Horizontal rules
    if (/^---+$/.test(block)) {
      htmlBlocks.push('<hr/>');
      continue;
    }

    // Tables: detect lines starting with |
    if (block.includes("|") && block.split("\n").length >= 2 && /^\|/.test(block.trim())) {
      htmlBlocks.push(parseMarkdownTable(block));
      continue;
    }

    // Headers
    block = block
      .replace(/^### (.*$)/gm, "<h3>$1</h3>")
      .replace(/^## (.*$)/gm, "<h2>$1</h2>")
      .replace(/^# (.*$)/gm, "<h1>$1</h1>");

    // If this block is purely a heading, push as-is
    if (/^<h[123]>/.test(block)) {
      htmlBlocks.push(block);
      continue;
    }

    // Bold and italic
    block = block
      .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Unordered list
    if (/^- /m.test(block)) {
      const items = block.split("\n")
        .filter((l) => l.startsWith("- "))
        .map((l) => `<li>${l.slice(2)}</li>`)
        .join("");
      htmlBlocks.push(`<ul>${items}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /m.test(block)) {
      const items = block.split("\n")
        .filter((l) => /^\d+\. /.test(l))
        .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
        .join("");
      htmlBlocks.push(`<ol>${items}</ol>`);
      continue;
    }

    // Regular paragraph
    block = block.replace(/\n/g, "<br/>");
    htmlBlocks.push(`<p>${block}</p>`);
  }

  return htmlBlocks.join("\n");
}

export interface PdfDocumentData {
  title: string;
  propertyName: string;
  period: string;
  content: string;
  type: "informe" | "acta";
}

export function generatePdfHtml(data: PdfDocumentData): string {
  const { title, propertyName, period, content, type } = data;
  const contentHtml = markdownToSimpleHtml(content);

  const accentColor = type === "informe" ? "#4338ca" : "#166534";
  const accentLight = type === "informe" ? "#eef2ff" : "#f0fdf4";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ${propertyName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 0;
      color: #1a1a2e;
      line-height: 1.7;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page {
      max-width: 820px;
      margin: 0 auto;
      padding: 50px 60px;
    }

    /* Header */
    .doc-header {
      text-align: center;
      padding-bottom: 28px;
      margin-bottom: 36px;
      border-bottom: 3px solid ${accentColor};
      position: relative;
    }
    .doc-header::after {
      content: '';
      position: absolute;
      bottom: -3px;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 3px;
      background: ${accentColor};
      opacity: 0.4;
    }
    .doc-header h1 {
      font-size: 26px;
      font-weight: 700;
      color: ${accentColor};
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .doc-header .meta {
      font-size: 14px;
      color: #64748b;
      font-weight: 500;
    }
    .doc-header .meta strong {
      color: #334155;
    }

    /* Content */
    h1 { font-size: 22px; color: ${accentColor}; margin: 32px 0 12px; font-weight: 700; letter-spacing: -0.01em; }
    h2 {
      font-size: 18px;
      color: ${accentColor};
      margin: 28px 0 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid ${accentLight};
      font-weight: 700;
    }
    h3 { font-size: 15px; color: #334155; margin: 20px 0 8px; font-weight: 600; }
    p { margin: 10px 0; font-size: 14px; color: #374151; }

    hr {
      border: none;
      height: 1px;
      background: linear-gradient(to right, transparent, #d1d5db, transparent);
      margin: 28px 0;
    }

    /* Lists */
    ul, ol { margin: 10px 0 10px 24px; font-size: 14px; color: #374151; }
    li { margin-bottom: 4px; padding-left: 4px; }
    li::marker { color: ${accentColor}; }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 13px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }
    thead th {
      background: ${accentLight};
      color: ${accentColor};
      font-weight: 600;
      text-align: left;
      padding: 10px 14px;
      border-bottom: 2px solid ${accentColor}20;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    tbody td {
      padding: 9px 14px;
      border-bottom: 1px solid #f3f4f6;
      color: #374151;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) { background: #fafbfc; }
    tbody tr:hover { background: ${accentLight}; }

    strong { color: #1e293b; }

    /* Footer */
    .doc-footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 2px solid #f1f5f9;
      font-size: 11px;
      color: #94a3b8;
      text-align: center;
      letter-spacing: 0.02em;
    }

    /* Print styles */
    @media print {
      body { padding: 0; }
      .page { padding: 30px 40px; max-width: none; }
      h2 { page-break-after: avoid; }
      table { page-break-inside: avoid; }
      .doc-footer { position: fixed; bottom: 20px; left: 0; right: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="doc-header">
      <h1>${title.toUpperCase()}</h1>
      <div class="meta"><strong>${propertyName}</strong> &mdash; ${period}</div>
    </div>
    ${contentHtml}
    <div class="doc-footer">
      Documento generado el ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })} &bull; PH Gestion
    </div>
  </div>
</body>
</html>`;
}
