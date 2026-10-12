import { describe, it, expect } from "vitest";
import { generatePdfHtml, markdownToSimpleHtml } from "./pdf-generator";

const celdasDeFilas = (html: string) =>
  [...html.matchAll(/<tr>((?:<td>.*?<\/td>)+)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<td>(.*?)<\/td>/g)].map((c) => c[1])
  );

describe("tablas", () => {
  const tabla = [
    "| Rubro | Presupuesto | Ejecutado | Saldo |",
    "|-------|-------------|-----------|-------|",
    "| Seguridad | 48.000.000 | | 48.000.000 |",
    "| Reserva | | 2.000.000 | |",
  ].join("\n");

  it("mantiene cada cifra en SU columna cuando hay celdas vacías", () => {
    // El defecto original descartaba los vacíos interiores y corría las cifras
    // a la izquierda: el saldo aparecía impreso bajo «Ejecutado».
    const filas = celdasDeFilas(markdownToSimpleHtml(tabla));
    expect(filas[0]).toEqual(["Seguridad", "48.000.000", "", "48.000.000"]);
    expect(filas[1]).toEqual(["Reserva", "", "2.000.000", ""]);
  });

  it("rellena las filas cortas hasta el ancho del encabezado", () => {
    const conFirmas = ["| Cargo | Nombre | Firma |", "|---|---|---|", "| Presidente | Carlos Ramirez |"].join("\n");
    expect(celdasDeFilas(markdownToSimpleHtml(conFirmas))[0]).toHaveLength(3);
  });

  it("no altera una tabla bien formada", () => {
    const buena = ["| A | B |", "|---|---|", "| 1 | 2 |", "| 3 | 4 |"].join("\n");
    expect(celdasDeFilas(markdownToSimpleHtml(buena))).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("conserva las negritas dentro de las celdas", () => {
    const conNegrita = ["| Rubro | Total |", "|---|---|", "| **Total** | 52.000.000 |"].join("\n");
    expect(markdownToSimpleHtml(conNegrita)).toContain("<strong>Total</strong>");
  });

  it("descarta las filas totalmente vacías", () => {
    const conVacia = ["| A | B |", "|---|---|", "| | |", "| 1 | 2 |"].join("\n");
    expect(celdasDeFilas(markdownToSimpleHtml(conVacia))).toEqual([["1", "2"]]);
  });
});

describe("listas", () => {
  it("conserva la frase que presenta la lista", () => {
    // Antes se filtraban solo las líneas de viñeta y el resto del bloque
    // desaparecía del documento, cifras incluidas.
    const html = markdownToSimpleHtml(
      "Compromisos pendientes, por $18.450.000:\n1. Contratar poliza\n2. Renovar aseo"
    );
    expect(html).toContain("18.450.000");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>Contratar poliza</li>");
  });

  it("conserva las sub-viñetas indentadas", () => {
    const html = markdownToSimpleHtml("- Bomba de agua\n  - Cambio de sello\n  - Revision electrica");
    expect(html).toContain("Cambio de sello");
    expect(html).toContain("Revision electrica");
  });

  it("respeta el orden entre texto y viñetas", () => {
    const html = markdownToSimpleHtml("Intro:\n- uno\nCierre del punto.\n- dos");
    expect(html.indexOf("Intro:")).toBeLessThan(html.indexOf("uno"));
    expect(html.indexOf("uno")).toBeLessThan(html.indexOf("Cierre del punto."));
    expect(html.indexOf("Cierre del punto.")).toBeLessThan(html.indexOf("dos"));
  });

  it("separa viñetas de numerales en listas distintas", () => {
    const html = markdownToSimpleHtml("- viñeta\n1. numeral");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
  });

  it("sigue tratando un párrafo normal como párrafo", () => {
    expect(markdownToSimpleHtml("Solo texto corrido.")).toBe("<p>Solo texto corrido.</p>");
  });

  it("una línea que empieza por número se trata como numeral, pero su texto NO se pierde", () => {
    // «2026. Un año cualquiera» es un elemento de lista numerada según
    // markdown, así que el número se consume como marcador. Lo que importa
    // aquí es la propiedad que se rompía antes: ningún texto desaparece.
    const html = markdownToSimpleHtml("- punto\n2026. Un año cualquiera");
    expect(html).toContain("Un año cualquiera");
    expect(html).toBe("<ul><li>punto</li></ul><ol><li>Un año cualquiera</li></ol>");
  });
});

describe("escape del contenido (informes y actas de la IA o de terceros)", () => {
  it("una etiqueta dentro del texto se muestra como texto, no se ejecuta", () => {
    const html = markdownToSimpleHtml("Aprobado <img src=x onerror=alert(1)> por el consejo");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("el markdown sigue funcionando sobre el texto ya escapado", () => {
    expect(markdownToSimpleHtml("**Total** & <b>x</b>")).toBe("<p><strong>Total</strong> &amp; &lt;b&gt;x&lt;/b&gt;</p>");
  });

  it("las celdas de las tablas también se escapan", () => {
    const html = markdownToSimpleHtml("| A | B |\n|---|---|\n| <script>x</script> | 2 |");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });

  it("el documento completo no deja pasar HTML del contenido", () => {
    const html = generatePdfHtml({
      title: "Informe", propertyName: "Torres", period: "Octubre", type: "informe",
      content: "Nota: <iframe src=https://evil.example></iframe>",
    });
    expect(html).not.toContain("<iframe");
    expect(html).toContain("&lt;iframe");
  });

  it("con textoYaEscapado (el acta ya escapó su texto) no se escapa dos veces", () => {
    expect(markdownToSimpleHtml("Torres &amp; Cía &lt;b&gt;", { textoYaEscapado: true })).toBe("<p>Torres &amp; Cía &lt;b&gt;</p>");
    const html = generatePdfHtml({
      title: "Acta", propertyName: "Torres", period: "Octubre", type: "acta", textoYaEscapado: true,
      content: "Punto &amp; cierre",
    });
    expect(html).toContain("Punto &amp; cierre");
    expect(html).not.toContain("&amp;amp;");
  });
});
