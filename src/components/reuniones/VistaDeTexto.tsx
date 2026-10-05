"use client";

import { ArrowUpRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import type { BloqueDeActa, Fragmento } from "@/lib/meetings/acta-vista";
import { formatearRelojCorto } from "@/lib/meetings/tipos";

const CSS = `
.re-txt-min { display: inline-flex; align-items: center; gap: 3px; min-height: 28px; margin: 0 2px; padding: 0 9px 0 10px; border: 0; border-radius: 999px; background: rgb(var(--accent-rgb) / .10); font: inherit; font-size: 13px; font-weight: 600; line-height: 1; color: var(--accent-text); font-feature-settings: "tnum" 1; white-space: nowrap; vertical-align: baseline; cursor: pointer; }
.re-txt-min > svg { width: 12px; height: 12px; flex: none; }
.re-txt-min:hover { background: rgb(var(--accent-rgb) / .18); }
.re-txt-min:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (pointer: coarse) { .re-txt-min { min-height: 36px; padding: 0 12px; } }
.re-txt-ref { display: inline-block; margin: 0 2px; padding: 1px 7px; border-radius: 6px; background: var(--surface-2); font-size: 12.5px; font-weight: 700; color: var(--ink-3); font-feature-settings: "tnum" 1; vertical-align: baseline; }
.re-txt-pendiente { padding: 0 4px; border-radius: 4px; background: rgb(var(--warn-rgb) / .16); color: inherit; font-weight: 600; }
`;

/** Un trozo del acta: texto con su énfasis, un minuto que lleva al audio, o la marca de una decisión o un compromiso. */
function Trozo({ f, alIrAlMinuto }: { f: Fragmento; alIrAlMinuto: (ms: number) => void }): ReactNode {
  if (f.tipo === "minuto") {
    const hora = formatearRelojCorto(f.segundos * 1000);
    return (
      <button type="button" className="re-txt-min" aria-label={`Ir al minuto ${hora} de la transcripción`} onClick={() => alIrAlMinuto(Math.max(0, f.segundos) * 1000)}>
        {hora}
        <ArrowUpRight aria-hidden="true" focusable="false" />
      </button>
    );
  }
  if (f.tipo === "ref") return <span className="re-txt-ref" title={f.id.startsWith("D") ? `Recoge la decisión ${f.id}` : `Recoge el compromiso ${f.id}`}>{f.id}</span>;
  // Lo que falta por completar se resalta: es lo que quien firma tiene que llenar.
  const partes = f.texto.split(/(\[PENDIENTE DE COMPLETAR[^\]]*\])/g);
  const contenido = partes.map((p, i) => (p.startsWith("[PENDIENTE DE COMPLETAR") ? <mark key={i} className="re-txt-pendiente">{p}</mark> : <Fragment key={i}>{p}</Fragment>));
  if (f.negrita) return <strong>{contenido}</strong>;
  if (f.cursiva) return <em>{contenido}</em>;
  return <>{contenido}</>;
}

const Linea = ({ fs, alIrAlMinuto }: { fs: Fragmento[]; alIrAlMinuto: (ms: number) => void }) => (
  <>
    {fs.map((f, i) => (
      <Trozo key={i} f={f} alIrAlMinuto={alIrAlMinuto} />
    ))}
  </>
);

function Bloque({ b, alIrAlMinuto }: { b: BloqueDeActa; alIrAlMinuto: (ms: number) => void }): ReactNode {
  switch (b.tipo) {
    case "titulo": {
      const H = b.nivel === 2 ? "h2" : "h3";
      return (
        <H>
          <Linea fs={b.fragmentos} alIrAlMinuto={alIrAlMinuto} />
        </H>
      );
    }
    case "parrafo":
      return (
        <p>
          {b.lineas.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <Linea fs={l} alIrAlMinuto={alIrAlMinuto} />
            </Fragment>
          ))}
        </p>
      );
    case "lista": {
      const L = b.ordenada ? "ol" : "ul";
      return (
        <L>
          {b.items.map((it, i) => (
            <li key={i}>
              <Linea fs={it} alIrAlMinuto={alIrAlMinuto} />
            </li>
          ))}
        </L>
      );
    }
    case "tabla":
      return (
        <div className="tabla-scroll" role="region" tabIndex={0} aria-label="Tabla del acta (se desplaza hacia los lados)">
          <table>
            <thead>
              <tr>
                {b.encabezado.map((c, i) => (
                  <th key={i} scope="col">
                    <Linea fs={c} alIrAlMinuto={alIrAlMinuto} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.filas.map((fila, i) => (
                <tr key={i}>
                  {fila.map((c, j) => (
                    <td key={j}>
                      <Linea fs={c} alIrAlMinuto={alIrAlMinuto} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "separador":
      return <hr />;
  }
}

/**
 * El acta o una respuesta de «Preguntar», ya leída en bloques (`leerActa`), dibujada con componentes: cada minuto es un botón que
 * lleva a ese punto de la transcripción, cada decisión o compromiso lleva su marca y lo que falta por completar se resalta.
 * Va dentro de un `<div className="k-md">`.
 */
export function TextoConMarcadores({ bloques, alIrAlMinuto }: { bloques: readonly BloqueDeActa[]; alIrAlMinuto: (ms: number) => void }) {
  return (
    <>
      <style href="k-reuniones-texto-local" precedence="default">
        {CSS}
      </style>
      {bloques.map((b, i) => (
        <Bloque key={i} b={b} alIrAlMinuto={alIrAlMinuto} />
      ))}
    </>
  );
}
