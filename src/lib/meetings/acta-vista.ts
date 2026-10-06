/**
 * El acta tal como se muestra en la app: el markdown con marcadores que arma `armarActa` (títulos, párrafos, listas, tablas,
 * `**negritas**`, `[[D1]]`, `[[C2]]` y `[[t=00:41:05]]`) convertido en bloques tipados que la pantalla dibuja con sus propios
 * componentes (nunca como HTML). Es puro: se prueba sin React. Solo entiende lo que produce el sistema; lo demás se muestra como texto.
 */
import { desescaparHtml, segundosDeHora } from "./acta-texto";

/** Un trozo de una línea: texto (con su énfasis), un minuto del audio, o la referencia a una decisión o un compromiso. */
export type Fragmento =
  | { tipo: "texto"; texto: string; negrita?: boolean; cursiva?: boolean }
  | { tipo: "minuto"; segundos: number }
  | { tipo: "ref"; id: string };

export type BloqueDeActa =
  | { tipo: "titulo"; nivel: 2 | 3; fragmentos: Fragmento[] }
  | { tipo: "parrafo"; lineas: Fragmento[][] }
  | { tipo: "lista"; ordenada: boolean; items: Fragmento[][] }
  | { tipo: "tabla"; encabezado: Fragmento[][]; filas: Fragmento[][][] }
  | { tipo: "separador" };

/** Un marcador, una negrita o una cursiva (la cursiva no empieza ni termina en espacio: «5 * 3 * 2» no es cursiva). */
const TOKEN = /\[\[(D\d{1,4}|C\d{1,4}|t=\d{1,3}:\d{2}:\d{2})\]\]|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*/g;

type Estilo = { negrita?: boolean; cursiva?: boolean };

/** Lo que cambia cómo se lee un texto. */
export type OpcionesDeLectura = {
  /** Un minuto que pasa de aquí (la duración de la reunión) no existe: se descarta. El acta ya viene limpia; las respuestas de «Preguntar», no. */
  maxSegundos?: number;
};

/** Una línea en sus fragmentos. Las entidades (`&amp;`, `&lt;`, `&gt;`) vuelven a ser el carácter: React ya escapa al dibujar. */
export function fragmentosDe(linea: string, estilo: Estilo = {}, opciones: OpcionesDeLectura = {}): Fragmento[] {
  const salida: Fragmento[] = [];
  const texto = (t: string, e: Estilo) => {
    if (t) salida.push({ tipo: "texto", texto: desescaparHtml(t), ...(e.negrita ? { negrita: true } : {}), ...(e.cursiva ? { cursiva: true } : {}) });
  };
  let desde = 0;
  for (const m of linea.matchAll(TOKEN)) {
    texto(linea.slice(desde, m.index), estilo);
    desde = m.index + m[0].length;
    if (m[1] !== undefined) {
      if (m[1].startsWith("t=")) {
        const s = segundosDeHora(m[1].slice(2));
        if (s !== null && (opciones.maxSegundos === undefined || s <= opciones.maxSegundos)) salida.push({ tipo: "minuto", segundos: s });
      } else {
        salida.push({ tipo: "ref", id: m[1] });
      }
    } else if (m[2] !== undefined) {
      salida.push(...fragmentosDe(m[2], { ...estilo, negrita: true }, opciones));
    } else {
      texto(m[3], { ...estilo, cursiva: true });
    }
  }
  texto(linea.slice(desde), estilo);
  return salida;
}

const VINETA = /^[-*]\s+(.*)$/;
const NUMERAL = /^\d+[.)]\s+(.*)$/;
const TITULO = /^(#{1,3})\s+(.*?)\s*#*\s*$/;
const SEPARADOR_DE_TABLA = /^:?-{3,}:?$/;

const celdasDe = (fila: string): string[] => fila.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function leerTabla(filas: string[], opciones: OpcionesDeLectura): BloqueDeActa {
  const celdas = filas.map(celdasDe);
  const encabezado = celdas[0];
  const cuerpo = celdas.slice(celdas[1]?.every((c) => SEPARADOR_DE_TABLA.test(c)) ? 2 : 1);
  // Una fila corta no desalinea la tabla y una larga se recorta al ancho del encabezado.
  const ajustar = (fila: string[]) => encabezado.map((_, i) => fragmentosDe(fila[i] ?? "", {}, opciones));
  return { tipo: "tabla", encabezado: encabezado.map((c) => fragmentosDe(c, {}, opciones)), filas: cuerpo.filter((f) => f.some((c) => c !== "")).map(ajustar) };
}

/** El acta (markdown con marcadores) en bloques. Lo que no se entiende queda como párrafo: nunca se pierde texto. */
export function leerActa(markdown: string, opciones: OpcionesDeLectura = {}): BloqueDeActa[] {
  const lineas = markdown.replace(/\r\n?/g, "\n").split("\n");
  const bloques: BloqueDeActa[] = [];
  let parrafo: Fragmento[][] = [];
  const cerrarParrafo = () => {
    if (parrafo.length > 0) bloques.push({ tipo: "parrafo", lineas: parrafo });
    parrafo = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const t = lineas[i].trim();
    if (!t) {
      cerrarParrafo();
      continue;
    }
    if (/^-{3,}$/.test(t)) {
      cerrarParrafo();
      bloques.push({ tipo: "separador" });
      continue;
    }
    const titulo = TITULO.exec(t);
    if (titulo) {
      cerrarParrafo();
      bloques.push({ tipo: "titulo", nivel: titulo[1].length >= 3 ? 3 : 2, fragmentos: fragmentosDe(titulo[2], {}, opciones) });
      continue;
    }
    if (t.startsWith("|")) {
      cerrarParrafo();
      const filas: string[] = [];
      while (i < lineas.length && lineas[i].trim().startsWith("|")) filas.push(lineas[i++]);
      i--;
      bloques.push(leerTabla(filas, opciones));
      continue;
    }
    const vineta = VINETA.exec(t);
    const numeral = vineta ? null : NUMERAL.exec(t);
    if (vineta || numeral) {
      cerrarParrafo();
      const ordenada = !vineta;
      const items: Fragmento[][] = [];
      while (i < lineas.length) {
        const siguiente = (ordenada ? NUMERAL : VINETA).exec(lineas[i].trim());
        if (!siguiente) break;
        items.push(fragmentosDe(siguiente[1], {}, opciones));
        i++;
      }
      i--;
      bloques.push({ tipo: "lista", ordenada, items });
      continue;
    }
    parrafo.push(fragmentosDe(t, {}, opciones));
  }
  cerrarParrafo();
  return bloques;
}
