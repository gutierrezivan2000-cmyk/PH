"use client";

import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Element, ElementContent } from "hast";
import { Chevron } from "@/components/kit";

/**
 * Pinta la respuesta del agente con formato.
 *
 * Antes llegaba como texto plano y por eso los prompts pedían «no uses markdown
 * con asteriscos»: una lista de plazos o una tabla de mayorías se leía como un
 * párrafo corrido lleno de asteriscos. Se renderiza de verdad —encabezados,
 * listas, tablas, código— con la tipografía de lectura del kit («Índice»,
 * clase `k-md`: 17 px/1,5, tablas con cabecera mono entre filetes), para que
 * funcione igual en claro y en oscuro.
 */

/* Ajustes locales sobre `.k-md` (el kit no los trae; ver pendientes del kit):
   - encabezados: el kit los pone en MAYÚSCULAS, pero los de una respuesta pueden
     ser frases largas; la regla de accesibilidad solo admite mayúsculas en rótulos
     de 1–4 palabras. Aquí: titular de 22 px (h3) y título de 17 px (h4).
   - tablas: ocupan todo el ancho de la respuesta (no 68 ch) y en móvil pasan a
     fichas: cada celda con el nombre de su columna encima (sale del <thead>).
   - bloques de código y notas al pie (remark-gfm), en la gramática del kit. */
const CSS_RESPUESTA = `
.k-md { position: relative; }
.k-md > .tabla-scroll { position: relative; max-width: 100%; }
.k-md > .tabla-scroll > table { margin-top: 2px; }
.k-md h3 { margin: 22px 0 8px; font-size: 22px; font-weight: 800; font-stretch: 75%; text-transform: none; letter-spacing: -.01em; line-height: 1.05; }
.k-md h4 { margin: 18px 0 6px; font-size: 17px; font-weight: 700; font-stretch: 100%; text-transform: none; letter-spacing: 0; line-height: 1.3; }
.k-md > :first-child { margin-top: 0; }
.k-md li > p { margin: 0; }
.k-md pre { margin: 0 0 14px; padding: 12px 14px; max-width: 100%; overflow-x: auto; background: var(--surface-2); border-left: 4px solid var(--rule); }
.k-md pre code { padding: 0; background: none; font-size: 14px; line-height: 1.45; }
.k-md sup a { font-weight: 600; text-decoration: none; }
.k-md sup a:hover { text-decoration: underline; }
.k-md .footnotes { position: relative; margin: 16px 0 14px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 14px; line-height: 1.5; color: var(--ink-2); }
.k-md .footnotes > h4 { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.k-md .footnotes ol { margin: 0; padding-left: 20px; }
.k-md .footnotes li { margin: 2px 0; }
.k-md .footnotes p { margin: 0; display: inline; }
.k-md .footnotes a[data-footnote-backref] { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 24px; margin-left: 4px; vertical-align: middle; color: var(--ink-2); text-decoration: none; }
.k-md .footnotes a[data-footnote-backref] svg { width: 12px; height: 12px; }
@media (max-width: 860px) {
  .k-md > .tabla-scroll { overflow: visible; }
  .k-md > .tabla-scroll > table, .k-md > .tabla-scroll tbody, .k-md > .tabla-scroll tr, .k-md > .tabla-scroll td { display: block; width: auto; }
  .k-md > .tabla-scroll thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .k-md > .tabla-scroll tbody tr { padding: 12px 0; border-bottom: 1px solid var(--line); }
  .k-md > .tabla-scroll tbody tr:first-child { border-top: 2px solid var(--rule); }
  .k-md > .tabla-scroll td { padding: 0; border: 0; }
  .k-md > .tabla-scroll td + td { margin-top: 8px; }
  .k-md > .tabla-scroll td:first-child { font-weight: 700; }
  .k-md > .tabla-scroll td[data-label]:not([data-label=""])::before { content: attr(data-label); display: block; margin-bottom: 2px;
    font: 500 12px/1.2 var(--f-mono); text-transform: uppercase; letter-spacing: .05em; color: var(--ink-3); }
}
`;

/** Nombres de las columnas de la tabla que se está pintando (para las fichas móviles). */
const Columnas = createContext<string[]>([]);

/**
 * Prefijo de los id de ESTA respuesta. Cada respuesta numera sus notas desde 1 y
 * remark-gfm les pone siempre los mismos id («user-content-fn-1», «footnote-label»):
 * con dos respuestas con notas en la misma conversación los id se repetían y la
 * llamada de la segunda saltaba a la nota de la primera.
 */
const Prefijo = createContext("");
const ID_ROTULO_NOTAS = "footnote-label";

function texto(n: ElementContent): string {
  if (n.type === "text") return n.value;
  if (n.type === "element") return n.children.map(texto).join("");
  return "";
}

function columnasDe(tabla?: Element): string[] {
  const esElemento = (c: ElementContent): c is Element => c.type === "element";
  const thead = tabla?.children.filter(esElemento).find((c) => c.tagName === "thead");
  const fila = thead?.children.filter(esElemento).find((c) => c.tagName === "tr");
  return fila ? fila.children.filter(esElemento).map((c) => texto(c).trim()) : [];
}

function Tabla({ node, children, ...p }: ComponentProps<"table"> & ExtraProps) {
  // Las tablas son justo lo que un administrador pide (cuotas, plazos,
  // mayorías): se envuelven para que en pantalla ancha se desplacen dentro de
  // la respuesta en vez de desbordar la página; en móvil pasan a fichas.
  return (
    <Columnas.Provider value={columnasDe(node)}>
      <div className="tabla-scroll">
        <table {...p}>{children}</table>
      </div>
    </Columnas.Provider>
  );
}

function FilaTabla(props: ComponentProps<"tr"> & ExtraProps) {
  const { children, ...p } = sinNodo(props);
  const columnas = useContext(Columnas);
  const celdas = Children.toArray(children)
    .filter(isValidElement)
    .map((c, i) => cloneElement(c as ReactElement<{ "data-label"?: string }>, { "data-label": columnas[i] ?? "" }));
  return <tr {...p}>{celdas}</tr>;
}

function Enlace(props: ComponentProps<"a"> & ExtraProps) {
  const { children, href, ...p } = sinNodo(props);
  const prefijo = useContext(Prefijo);
  const interno = typeof href === "string" && href.startsWith("#");
  // Las llamadas a nota se describen con el rótulo «Notas» de su propia respuesta
  // (el id fijo de remark-gfm apuntaba siempre al de la primera).
  if (p["aria-describedby"] === ID_ROTULO_NOTAS) p["aria-describedby"] = prefijo + ID_ROTULO_NOTAS;
  // Vuelta de una nota al pie: el carácter «↩» no está en las fuentes del
  // armazón; se dibuja con el chevrón del kit y conserva su nombre accesible.
  if ("data-footnote-backref" in p) {
    return (
      <a href={href} {...p}>
        <Chevron dir="arriba" />
      </a>
    );
  }
  return (
    <a href={href} {...(interno ? {} : { target: "_blank", rel: "noopener noreferrer" })} {...p}>
      {children}
    </a>
  );
}

/** Quita `node` (lo añade react-markdown) antes de pasar las props al DOM. */
function sinNodo<P extends ExtraProps>(p: P): Omit<P, "node"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { node, ...resto } = p;
  return resto;
}

/** <h4> de la respuesta; también el rótulo (solo para lectores) de las notas, con su id propio. */
function Titulo4(props: ComponentProps<"h4"> & ExtraProps) {
  const { id, ...p } = sinNodo(props);
  const prefijo = useContext(Prefijo);
  return <h4 id={id === ID_ROTULO_NOTAS ? prefijo + ID_ROTULO_NOTAS : id} {...p} />;
}

const COMPONENTES: Components = {
  // Dentro de la respuesta no puede haber un <h1>: el de la pantalla es el del agente.
  h1: (p) => <h3 {...sinNodo(p)} />,
  h2: (p) => <h3 {...sinNodo(p)} />,
  h3: (p) => <h4 {...sinNodo(p)} />,
  h4: Titulo4,
  h5: (p) => <h4 {...sinNodo(p)} />,
  h6: (p) => <h4 {...sinNodo(p)} />,
  a: Enlace,
  table: Tabla,
  tr: FilaTabla,
};

export function RespuestaMarkdown({ children }: { children: string }): ReactNode {
  // useId es estable entre servidor y cliente; se limpia por si trae caracteres
  // que no convienen en un fragmento de URL («#…»).
  const prefijo = `r${useId().replace(/[^\w-]/g, "")}-`;
  return (
    <div className="k-md">
      <style href="k-respuesta-md" precedence="default">
        {CSS_RESPUESTA}
      </style>
      <Prefijo.Provider value={prefijo}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          remarkRehypeOptions={{
            clobberPrefix: prefijo,
            footnoteLabel: "Notas",
            // Por defecto es un <h2>: dentro de la respuesta quedaba al nivel del
            // título de la conversación en el índice de encabezados.
            footnoteLabelTagName: "h4",
            footnoteBackLabel: (i: number) => `Volver a la llamada ${i + 1}`,
          }}
          components={COMPONENTES}
        >
          {children}
        </ReactMarkdown>
      </Prefijo.Provider>
    </div>
  );
}
