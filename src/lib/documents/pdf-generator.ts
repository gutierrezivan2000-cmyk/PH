// PDF generation using a simple HTML-to-PDF approach
// We use a markdown-to-HTML conversion and then generate PDF server-side

export function markdownToSimpleHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gm, "<h3>$1</h3>")
    .replace(/^## (.*$)/gm, "<h2>$1</h2>")
    .replace(/^# (.*$)/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    // Lists
    .replace(/^\- (.*$)/gm, "<li>$1</li>")
    .replace(/^\d+\. (.*$)/gm, "<li>$1</li>")
    // Line breaks
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br/>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>(?:<br\/>)?)+/g, (match) => {
    return "<ul>" + match.replace(/<br\/>/g, "") + "</ul>";
  });

  return `<div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6;"><p>${html}</p></div>`;
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

  const headerColor = type === "informe" ? "#1e40af" : "#15803d";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      margin: 0;
      padding: 40px;
      color: #1a1a1a;
      line-height: 1.6;
    }
    .header {
      text-align: center;
      border-bottom: 3px solid ${headerColor};
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      color: ${headerColor};
      font-size: 24px;
      margin: 0;
    }
    .header .subtitle {
      color: #666;
      font-size: 14px;
      margin-top: 8px;
    }
    h2 { color: ${headerColor}; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
    h3 { color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    .footer {
      margin-top: 40px;
      border-top: 1px solid #ddd;
      padding-top: 15px;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="subtitle">${propertyName} | ${period}</div>
  </div>
  ${contentHtml}
  <div class="footer">
    Documento generado el ${new Date().toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}
  </div>
</body>
</html>`;
}
