/**
 * Archivos que los agentes pueden GENERAR.
 *
 * Hasta ahora el chat solo devolvía texto: la llamada al modelo no pasaba
 * ninguna herramienta, así que por muy bien que redactara un presupuesto no
 * había forma de bajarlo como hoja de cálculo. Aquí viven las herramientas que
 * se le ofrecen al modelo y los constructores que producen el binario.
 *
 * Los constructores son funciones puras (datos → Buffer) para poder probarlos
 * sin red ni modelo.
 */

export type FormatoArchivo = "xlsx" | "docx" | "pdf";

export interface ArchivoGenerado {
  nombre: string;
  formato: FormatoArchivo;
  mime: string;
  buffer: Buffer;
}

const MIME: Record<FormatoArchivo, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/** Nombre de archivo seguro: va en una cabecera y en una ruta de almacenamiento. */
export function nombreSeguro(nombre: string, formato: FormatoArchivo): string {
  const base = (nombre || "documento")
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ.-]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "documento";
  return `${base}.${formato}`;
}

// ── Hoja de cálculo ─────────────────────────────────────────────────────────

export interface HojaCalculo {
  nombre?: string;
  /** Primera fila = encabezados. El resto, datos. */
  filas: (string | number | null)[][];
}

export async function construirExcel(
  nombre: string,
  hojas: HojaCalculo[]
): Promise<ArchivoGenerado> {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();

  hojas.forEach((hoja, i) => {
    const filas = (hoja.filas || []).map((f) => (Array.isArray(f) ? f : [f]));
    const ws = XLSX.utils.aoa_to_sheet(filas.length > 0 ? filas : [[""]]);

    // Ancho de columna según el contenido: sin esto todo sale a 8 caracteres y
    // cualquier nombre de propiedad aparece cortado.
    const anchos: number[] = [];
    for (const fila of filas) {
      fila.forEach((celda, c) => {
        const largo = String(celda ?? "").length;
        anchos[c] = Math.min(60, Math.max(anchos[c] ?? 10, largo + 2));
      });
    }
    ws["!cols"] = anchos.map((w) => ({ wch: w }));

    // Excel corta los nombres de hoja en 31 caracteres y prohíbe : \ / ? * [ ]
    const titulo = (hoja.nombre || `Hoja ${i + 1}`).replace(/[:\\/?*[\]]/g, "-").slice(0, 31);
    XLSX.utils.book_append_sheet(libro, ws, titulo);
  });

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { nombre: nombreSeguro(nombre, "xlsx"), formato: "xlsx", mime: MIME.xlsx, buffer };
}

// ── Documento de Word ───────────────────────────────────────────────────────

export interface SeccionDocumento {
  titulo?: string;
  /** Párrafos de texto. Una lista de viñetas se escribe con "- " al inicio. */
  parrafos?: string[];
  /** Tabla opcional; la primera fila son los encabezados. */
  tabla?: (string | number)[][];
}

export async function construirWord(
  nombre: string,
  titulo: string,
  secciones: SeccionDocumento[]
): Promise<ArchivoGenerado> {
  const {
    Document, Packer, Paragraph, HeadingLevel, TextRun,
    Table, TableRow, TableCell, WidthType, AlignmentType,
  } = await import("docx");

  // Un documento mezcla párrafos y tablas, así que el array los admite a ambos.
  const hijos: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];

  hijos.push(
    new Paragraph({
      text: titulo || "Documento",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    })
  );

  for (const sec of secciones || []) {
    if (sec.titulo) {
      hijos.push(new Paragraph({ text: sec.titulo, heading: HeadingLevel.HEADING_2 }));
    }
    for (const p of sec.parrafos || []) {
      const texto = String(p ?? "");
      const esVineta = /^\s*[-*]\s+/.test(texto);
      hijos.push(
        new Paragraph({
          children: [new TextRun(esVineta ? texto.replace(/^\s*[-*]\s+/, "") : texto)],
          bullet: esVineta ? { level: 0 } : undefined,
          spacing: { after: 120 },
        })
      );
    }
    if (sec.tabla && sec.tabla.length > 0) {
      const filas = sec.tabla.map((fila, i) =>
        new TableRow({
          children: fila.map(
            (celda) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: String(celda ?? ""), bold: i === 0 })],
                  }),
                ],
              })
          ),
        })
      );
      hijos.push(new Table({ rows: filas, width: { size: 100, type: WidthType.PERCENTAGE } }));
      hijos.push(new Paragraph({ text: "" }));
    }
  }

  const doc = new Document({ sections: [{ children: hijos }] });
  const buffer = await Packer.toBuffer(doc);
  return { nombre: nombreSeguro(nombre, "docx"), formato: "docx", mime: MIME.docx, buffer };
}

// ── PDF ─────────────────────────────────────────────────────────────────────

export async function construirPdf(
  nombre: string,
  titulo: string,
  secciones: SeccionDocumento[]
): Promise<ArchivoGenerado> {
  const React = (await import("react")).default;
  const { Document, Page, Text, View, StyleSheet, renderToBuffer, Font } = await import(
    "@react-pdf/renderer"
  );
  // Sin esto, una palabra larga (un NIT, un correo) parte con guiones raros.
  Font.registerHyphenationCallback((w: string) => [w]);

  const s = StyleSheet.create({
    page: { padding: 44, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5 },
    titulo: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 16, color: "#1f2937" },
    seccion: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6, color: "#374151" },
    parrafo: { marginBottom: 6, color: "#1f2937" },
    fila: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5e7eb", paddingVertical: 4 },
    celda: { flex: 1, paddingRight: 8 },
    celdaEnc: { flex: 1, paddingRight: 8, fontFamily: "Helvetica-Bold" },
    pie: { position: "absolute", bottom: 24, left: 44, right: 44, fontSize: 8, color: "#9ca3af", textAlign: "center" },
  });

  const bloques: unknown[] = [React.createElement(Text, { style: s.titulo, key: "t" }, titulo || "Documento")];

  (secciones || []).forEach((sec, i) => {
    if (sec.titulo) bloques.push(React.createElement(Text, { style: s.seccion, key: `s${i}` }, sec.titulo));
    (sec.parrafos || []).forEach((p, j) =>
      bloques.push(React.createElement(Text, { style: s.parrafo, key: `p${i}-${j}` }, String(p ?? "")))
    );
    (sec.tabla || []).forEach((fila, j) =>
      bloques.push(
        React.createElement(
          View,
          { style: s.fila, key: `f${i}-${j}` },
          fila.map((celda, k) =>
            React.createElement(
              Text,
              { style: j === 0 ? s.celdaEnc : s.celda, key: `c${k}` },
              String(celda ?? "")
            )
          )
        )
      )
    );
  });

  bloques.push(
    React.createElement(
      Text,
      { style: s.pie, key: "pie", fixed: true },
      "Generado por SOPH.IA · Revisa el contenido antes de usarlo oficialmente"
    )
  );

  const doc = React.createElement(
    Document,
    null,
    React.createElement(Page, { size: "A4", style: s.page }, ...(bloques as never[]))
  );
  const buffer = await renderToBuffer(doc as never);
  return { nombre: nombreSeguro(nombre, "pdf"), formato: "pdf", mime: MIME.pdf, buffer: Buffer.from(buffer) };
}
