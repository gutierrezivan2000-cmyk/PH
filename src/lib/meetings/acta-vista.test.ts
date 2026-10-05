/** El acta en la pantalla: el markdown con marcadores convertido en bloques que la app dibuja (nunca como HTML). */
import { describe, expect, it } from "vitest";
import { armarActa, planificarSecciones } from "./acta";
import { fragmentosDe, leerActa, type BloqueDeActa, type Fragmento } from "./acta-vista";
import { DURACION_SEPTIEMBRE_MS, FICHA_SEPTIEMBRE } from "./demo-datos";

const t = (texto: string, extra: { negrita?: boolean; cursiva?: boolean } = {}): Fragmento => ({ tipo: "texto", texto, ...extra });
const min = (segundos: number): Fragmento => ({ tipo: "minuto", segundos });
const ref = (id: string): Fragmento => ({ tipo: "ref", id });

describe("fragmentosDe", () => {
  it("texto, negritas, cursivas, minutos y referencias, cada cosa en su fragmento y en orden", () => {
    expect(fragmentosDe("Se aprueba **la prórroga** del contrato. [[D1]] [[t=01:05:30]] Fin")).toEqual([
      t("Se aprueba "), t("la prórroga", { negrita: true }), t(" del contrato. "), ref("D1"), t(" "), min(3930), t(" Fin"),
    ]);
    expect(fragmentosDe("a *dijo* b")).toEqual([t("a "), t("dijo", { cursiva: true }), t(" b")]);
  });

  it("un minuto con una cifra en las horas se lee igual que uno con dos", () => {
    expect(fragmentosDe("[[t=1:05:30]] y [[t=01:05:30]]")).toEqual([min(3930), t(" y "), min(3930)]);
  });

  it("las entidades vuelven a ser el carácter (React escapa al dibujar), y nada se interpreta como HTML", () => {
    expect(fragmentosDe("Torres &amp; Cía &lt;b&gt;x&lt;/b&gt;")).toEqual([t("Torres & Cía <b>x</b>")]);
    expect(fragmentosDe("&lt;script&gt;alert(1)&lt;/script&gt;")).toEqual([t("<script>alert(1)</script>")]);
  });

  it("los marcadores dentro de una negrita se reconocen, y la negrita se conserva en lo de alrededor", () => {
    expect(fragmentosDe("**Aprobado** [[D2]] y **hecho [[t=00:10:00]] ya**")).toEqual([
      t("Aprobado", { negrita: true }), t(" "), ref("D2"), t(" y "), t("hecho ", { negrita: true }), min(600), t(" ya", { negrita: true }),
    ]);
  });

  it("lo que parece marcador y no lo es se muestra como texto; una hora imposible se descarta", () => {
    expect(fragmentosDe("[[X1]] [D1] [[ D1 ]]")).toEqual([t("[[X1]] [D1] [[ D1 ]]")]);
    expect(fragmentosDe("a [[t=00:75:00]] b")).toEqual([t("a "), t(" b")]);
  });

  it("un asterisco suelto o una multiplicación no son cursiva", () => {
    expect(fragmentosDe("5 * 3 * 2 = 30")).toEqual([t("5 * 3 * 2 = 30")]);
    expect(fragmentosDe("sin cierre *abierta")).toEqual([t("sin cierre *abierta")]);
  });

  it("una línea vacía no tiene fragmentos", () => {
    expect(fragmentosDe("")).toEqual([]);
  });
});

describe("leerActa", () => {
  it("títulos, párrafos de varias líneas, listas, separadores y tablas", () => {
    const md = [
      "## ACTA No. [PENDIENTE DE COMPLETAR] — CONSEJO",
      "",
      "**Fecha:** 15 de septiembre",
      "**Hora:** 7:00 p. m.",
      "",
      "---",
      "",
      "### 1. ASISTENTES",
      "",
      "- Martha — Presidente",
      "- Jorge",
      "",
      "1. Quórum",
      "2) Cartera",
      "",
      "| A | B |",
      "|---|---|",
      "| x [[t=00:00:05]] | y |",
    ].join("\n");
    expect(leerActa(md)).toEqual<BloqueDeActa[]>([
      { tipo: "titulo", nivel: 2, fragmentos: [t("ACTA No. [PENDIENTE DE COMPLETAR] — CONSEJO")] },
      { tipo: "parrafo", lineas: [[t("Fecha:", { negrita: true }), t(" 15 de septiembre")], [t("Hora:", { negrita: true }), t(" 7:00 p. m.")]] },
      { tipo: "separador" },
      { tipo: "titulo", nivel: 3, fragmentos: [t("1. ASISTENTES")] },
      { tipo: "lista", ordenada: false, items: [[t("Martha — Presidente")], [t("Jorge")]] },
      { tipo: "lista", ordenada: true, items: [[t("Quórum")], [t("Cartera")]] },
      { tipo: "tabla", encabezado: [[t("A")], [t("B")]], filas: [[[t("x "), min(5)], [t("y")]]] },
    ]);
  });

  it("una línea que presenta una lista y la lista misma salen como dos bloques, sin perder nada", () => {
    expect(leerActa("Compromisos de la sesión:\n- uno\n- dos\nCierre.")).toEqual([
      { tipo: "parrafo", lineas: [[t("Compromisos de la sesión:")]] },
      { tipo: "lista", ordenada: false, items: [[t("uno")], [t("dos")]] },
      { tipo: "parrafo", lineas: [[t("Cierre.")]] },
    ]);
  });

  it("una tabla con una fila corta o larga se ajusta al encabezado, y las filas vacías se ignoran", () => {
    const tabla = leerActa("| A | B | C |\n|---|---|---|\n| 1 | 2 |\n| 1 | 2 | 3 | 4 |\n|  |  |  |")[0];
    expect(tabla).toMatchObject({ tipo: "tabla" });
    if (tabla.tipo !== "tabla") return;
    expect(tabla.filas).toHaveLength(2);
    expect(tabla.filas.map((f) => f.length)).toEqual([3, 3]);
    expect(tabla.filas[0][2]).toEqual([]);
  });

  it("los títulos con almohadillas de más o de cierre se leen, y un # solo es un título de segundo nivel", () => {
    expect(leerActa("# Uno\n### Dos ###")).toEqual([
      { tipo: "titulo", nivel: 2, fragmentos: [t("Uno")] },
      { tipo: "titulo", nivel: 3, fragmentos: [t("Dos")] },
    ]);
  });

  it("un texto sin estructura es un párrafo; vacío no tiene bloques; los saltos de línea de Windows no estorban", () => {
    expect(leerActa("Solo texto.")).toEqual([{ tipo: "parrafo", lineas: [[t("Solo texto.")]] }]);
    expect(leerActa("")).toEqual([]);
    expect(leerActa("  \n\n \n")).toEqual([]);
    expect(leerActa("a\r\n\r\nb")).toEqual([{ tipo: "parrafo", lineas: [[t("a")]] }, { tipo: "parrafo", lineas: [[t("b")]] }]);
  });

  it("sea cual sea el texto, termina y no pierde nada de lo escrito (muchos documentos al azar)", () => {
    let semilla = 20_261_005;
    const azar = (n: number) => {
      semilla = (semilla * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return semilla % n;
    };
    const plantillas = [
      (w: string) => `- ${w}`, (w: string) => `* ${w}`, (w: string) => `1. ${w}`, (w: string) => `2) ${w}`, (w: string) => `## ${w}`, (w: string) => `### ${w} ###`,
      (w: string) => `# ${w}`, (w: string) => `**${w}**`, (w: string) => `*${w}*`, (w: string) => `[[t=00:00:05]] ${w}`, (w: string) => `${w} [[D1]] [[C2]]`,
      (w: string) => `| ${w} | x |`, (w: string) => `|---|---|\n| ${w} | y |`, (w: string) => `| ${w}`, (w: string) => `  ${w}  `, (w: string) => w,
      () => "", () => "---", () => "   ", () => "|", () => "|---|",
    ];
    for (let caso = 0; caso < 400; caso++) {
      const palabras: string[] = [];
      const lineas = Array.from({ length: 1 + azar(30) }, (_, i) => {
        const plantilla = plantillas[azar(plantillas.length)];
        const palabra = `palabra${caso}x${i}`;
        const linea = plantilla(palabra);
        if (linea.includes(palabra)) palabras.push(palabra);
        return linea;
      });
      const bloques = leerActa(lineas.join(azar(5) === 0 ? "\r\n" : "\n"));
      const textos: string[] = [];
      const ver = (fs: Fragmento[]) => fs.forEach((f) => (f.tipo === "texto" ? textos.push(f.texto) : 0));
      for (const b of bloques) {
        if (b.tipo === "titulo") ver(b.fragmentos);
        else if (b.tipo === "parrafo") b.lineas.forEach(ver);
        else if (b.tipo === "lista") b.items.forEach(ver);
        else if (b.tipo === "tabla") [...b.encabezado, ...b.filas.flat()].forEach(ver);
      }
      const todo = textos.join(" ");
      for (const p of palabras) expect(todo, `${p} en el documento ${caso}`).toContain(p);
    }
  });

  describe("con el acta que arma el sistema", () => {
    const secciones = planificarSecciones(FICHA_SEPTIEMBRE, DURACION_SEPTIEMBRE_MS);
    const armada = armarActa({
      datos: { propiedad: "Torres & Cía", tipo: "consejo", fecha: new Date("2026-09-16T00:00:00Z"), duracionMs: DURACION_SEPTIEMBRE_MS },
      ficha: FICHA_SEPTIEMBRE,
      secciones: secciones.map((seccion) => ({ seccion, markdown: `[[t=00:00:05]] Se trató **${seccion.titulo}** &amp; más. ${[...seccion.decisiones, ...seccion.compromisos].map((id) => `[[${id}]]`).join(" ")}` })),
      asistentes: FICHA_SEPTIEMBRE.asistentes,
    });
    const bloques = leerActa(armada.conMarcadores);
    const textoDe = (fs: Fragmento[]) => fs.map((f) => (f.tipo === "texto" ? f.texto : "")).join("");

    it("ningún marcador queda como texto crudo: todos son minutos o referencias; y ninguna entidad queda escrita", () => {
      const textos: string[] = [];
      const ver = (fs: Fragmento[]) => fs.forEach((f) => (f.tipo === "texto" ? textos.push(f.texto) : 0));
      for (const b of bloques) {
        if (b.tipo === "titulo") ver(b.fragmentos);
        else if (b.tipo === "parrafo") b.lineas.forEach(ver);
        else if (b.tipo === "lista") b.items.forEach(ver);
        else if (b.tipo === "tabla") [...b.encabezado, ...b.filas.flat()].forEach(ver);
      }
      expect(textos.length).toBeGreaterThan(50);
      expect(textos.filter((x) => x.includes("[[") || x.includes("]]"))).toEqual([]);
      expect(textos.filter((x) => /&(amp|lt|gt);/.test(x))).toEqual([]);
    });

    it("los títulos son los del acta, en orden", () => {
      const titulos = bloques.flatMap((b) => (b.tipo === "titulo" ? [`${b.nivel}:${textoDe(b.fragmentos)}`] : []));
      expect(titulos).toEqual([
        "2:ACTA No. [PENDIENTE DE COMPLETAR] — CONSEJO DE ADMINISTRACIÓN",
        "3:1. ASISTENTES", "3:2. ORDEN DEL DÍA", "3:3. DESARROLLO DE LA REUNIÓN", "3:4. DECISIONES ADOPTADAS", "3:5. VOTACIONES", "3:6. COMPROMISOS",
        "3:7. CIERRE DE LA REUNIÓN",
      ]);
    });

    it("el nombre de la copropiedad con «&» se lee como «&»", () => {
      const encabezado = bloques.find((b) => b.tipo === "parrafo")!;
      expect(JSON.stringify(encabezado)).toContain("Torres & Cía");
    });

    it("las tablas de votaciones y compromisos traen su columna «Minuto» con un minuto en cada fila", () => {
      const tablas = bloques.flatMap((b) => (b.tipo === "tabla" ? [b] : []));
      expect(tablas).toHaveLength(2);
      for (const tabla of tablas) {
        expect(textoDe(tabla.encabezado[tabla.encabezado.length - 1])).toBe("Minuto");
        for (const fila of tabla.filas) {
          expect(fila).toHaveLength(tabla.encabezado.length);
          expect(fila[fila.length - 1].map((f) => f.tipo)).toEqual(["minuto"]);
        }
      }
      expect(tablas[1].filas).toHaveLength(6);
    });

    it("cada decisión y cada compromiso queda referenciado en el desarrollo, y cada sección tiene su minuto", () => {
      const refs = new Set<string>();
      let minutos = 0;
      const recorrer = (fs: Fragmento[]) => fs.forEach((f) => (f.tipo === "ref" ? refs.add(f.id) : f.tipo === "minuto" ? minutos++ : 0));
      for (const b of bloques) if (b.tipo === "parrafo") b.lineas.forEach(recorrer);
      for (const id of ["D1", "D2", "D3", "C1", "C2", "C3", "C4", "C5", "C6"]) expect(refs.has(id), id).toBe(true);
      expect(minutos).toBeGreaterThanOrEqual(secciones.length);
    });

    it("la lista de asistentes y el orden del día salen como listas", () => {
      const listas = bloques.flatMap((b) => (b.tipo === "lista" ? [b] : []));
      // Asistentes, orden del día y decisiones adoptadas.
      expect(listas.map((l) => [l.ordenada, l.items.length])).toEqual([[false, 5], [true, 5], [false, 3]]);
      expect(textoDe(listas[0].items[0])).toBe("Martha López — Presidente del consejo");
    });
  });
});
