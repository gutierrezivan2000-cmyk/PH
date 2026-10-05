"use client";

import { ArrowUpRight, CircleAlert, CircleCheck, Download, ExternalLink, FileSignature, ListChecks, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import { Aviso, BarraProgreso, Boton, Esqueleto, Etiqueta, ErrorCarga, MenuMas, Panel, Vacio, type ItemMenu } from "@/components/kit";
import type { ActaEnPantalla } from "@/components/reuniones/useActa";
import { leerActa, type BloqueDeActa, type Fragmento } from "@/lib/meetings/acta-vista";
import { requisitosEnOrden, resumenDeRequisitos, sePuedePedirActa, textoDeEtapaDeActa } from "@/lib/meetings/acta-pantalla";
import { haceCuanto } from "@/lib/meetings/formato";
import { formatearRelojCorto } from "@/lib/meetings/tipos";

const CSS = `
.re-act { display: grid; gap: 18px; }
.re-act-nota { margin: 0; max-width: 64ch; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-act-ia { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0; font-size: 14px; color: var(--ink-3); }
.re-act-barra { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
.re-act-barra .acc { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.re-act-etapa { margin: 0; font-size: 15.5px; font-weight: 600; color: var(--ink); font-feature-settings: "tnum" 1; }
.re-act-proceso { display: grid; gap: 12px; max-width: 560px; }
.re-act-lista { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.re-act-lista > li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-act-lista svg { width: 18px; height: 18px; margin-top: 2px; color: var(--ink-3); }
.re-act-req b { display: block; font-size: 15px; font-weight: 600; color: var(--ink); }
.re-act-req small { display: block; font-size: 14px; color: var(--ink-3); }
.re-act-req .ok svg { color: var(--ok-text); }
.re-act-doc { max-width: 860px; margin: 0 auto; padding: 8px 4px 4px; }
.re-act-doc > .k-md > * { max-width: none; }
.re-act-doc .k-md h2 { margin: 6px 0 14px; font-size: 21px; text-align: center; }
.re-act-doc .k-md h3 { margin: 26px 0 8px; font-size: 16px; letter-spacing: .02em; }
.re-act-doc .k-md p { font-size: 16px; line-height: 1.65; }
.re-act-min { display: inline-flex; align-items: center; gap: 3px; min-height: 28px; margin: 0 2px; padding: 0 9px 0 10px; border: 0; border-radius: 999px; background: rgb(var(--accent-rgb) / .10); font: inherit; font-size: 13px; font-weight: 600; line-height: 1; color: var(--accent-text); font-feature-settings: "tnum" 1; white-space: nowrap; vertical-align: baseline; cursor: pointer; }
.re-act-min > svg { width: 12px; height: 12px; flex: none; }
.re-act-min:hover { background: rgb(var(--accent-rgb) / .18); }
.re-act-min:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (pointer: coarse) { .re-act-min { min-height: 36px; padding: 0 12px; } }
.re-act-ref { display: inline-block; margin: 0 2px; padding: 1px 7px; border-radius: 6px; background: var(--surface-2); font-size: 12.5px; font-weight: 700; color: var(--ink-3); font-feature-settings: "tnum" 1; vertical-align: baseline; }
.re-act-pendiente { padding: 0 4px; border-radius: 4px; background: rgb(var(--warn-rgb) / .16); color: inherit; font-weight: 600; }
.re-act-firma { white-space: pre-line; }
@media (max-width: 560px) { .re-act-barra .acc > .k-btn { flex: 1 1 auto; } }
`;

/** Un trozo del acta: texto con su énfasis, un minuto que lleva al audio, o la marca de una decisión o un compromiso. */
function Trozo({ f, alIrAlMinuto }: { f: Fragmento; alIrAlMinuto: (ms: number) => void }): ReactNode {
  if (f.tipo === "minuto") {
    const hora = formatearRelojCorto(f.segundos * 1000);
    return (
      <button type="button" className="re-act-min" aria-label={`Ir al minuto ${hora} de la transcripción`} onClick={() => alIrAlMinuto(Math.max(0, f.segundos) * 1000)}>
        {hora}
        <ArrowUpRight aria-hidden="true" focusable="false" />
      </button>
    );
  }
  if (f.tipo === "ref") return <span className="re-act-ref" title={f.id.startsWith("D") ? `Recoge la decisión ${f.id}` : `Recoge el compromiso ${f.id}`}>{f.id}</span>;
  // Lo que falta por completar se resalta: es lo que quien firma tiene que llenar.
  const partes = f.texto.split(/(\[PENDIENTE DE COMPLETAR[^\]]*\])/g);
  const contenido = partes.map((p, i) => (p.startsWith("[PENDIENTE DE COMPLETAR") ? <mark key={i} className="re-act-pendiente">{p}</mark> : <Fragment key={i}>{p}</Fragment>));
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
 * La pestaña «Acta»: pedir el acta de la reunión, ver cómo se redacta, y cuando está lista, leerla con cada minuto enlazado al
 * audio, lo que hay que verificar antes de firmar y qué requisitos legales cumple. Si falla, lo dice y deja intentarlo de nuevo.
 */
export function TabActa({
  acta: estado, estadoDeLaReunion, alIrAlMinuto, alRedactarOtraVez, alAvisar,
}: {
  acta: ActaEnPantalla;
  estadoDeLaReunion: string;
  alIrAlMinuto: (ms: number) => void;
  /** Pide confirmación antes de gastar otra generación del plan. */
  alRedactarOtraVez: () => void;
  alAvisar: (tipo: "ok" | "error", titulo: string) => void;
}) {
  const { acta, texto } = estado;
  const bloques = useMemo(() => (texto ? leerActa(texto) : []), [texto]);
  const puedePedir = sePuedePedirActa(estadoDeLaReunion);

  const pedir = async () => {
    const r = await estado.pedir();
    if (!r.ok) alAvisar("error", r.mensaje);
    else if (r.yaEnCurso) alAvisar("ok", "El acta ya se está redactando.");
  };
  const reintentar = async () => {
    const r = await estado.reanudar();
    if (!r.ok) alAvisar("error", r.mensaje);
    else alAvisar("ok", "Retomamos el acta: solo se repite lo que falló.");
  };

  const estilos = (
    <style href="k-reuniones-acta-local" precedence="default">
      {CSS}
    </style>
  );

  if (estado.cargando) {
    return (
      <div className="re-act">
        {estilos}
        <Esqueleto variante="completo" filas={3} etiquetaAccesible="Cargando el acta…" />
      </div>
    );
  }

  if (estado.errorDeCarga) {
    return (
      <div className="re-act">
        {estilos}
        <ErrorCarga
          titulo="No pudimos cargar el acta."
          texto={estado.errorDeCarga}
          acciones={
            <Boton variante="secundario" onClick={estado.recargar}>
              Reintentar
            </Boton>
          }
        />
      </div>
    );
  }

  /* ── Todavía no se ha pedido ─────────────────────────────────────────── */
  if (!acta) {
    return (
      <div className="re-act">
        {estilos}
        <Vacio
          icono={FileSignature}
          tono="violet"
          titulo="Redacta el acta de esta reunión."
          texto="La IA lee la transcripción completa y redacta el acta: asistentes, orden del día, lo que se trató, decisiones, votaciones y compromisos, cada uno con su minuto en el audio. Lo que no se dijo queda como «[PENDIENTE DE COMPLETAR]»: nunca se inventa. Tarda unos minutos y cuenta como una generación de tu plan."
          acciones={
            <>
              <Boton icono={Sparkles} cargando={estado.enviando} textoCargando="Empezando…" disabled={!puedePedir} onClick={() => void pedir()}>
                Redactar acta
              </Boton>
              {!puedePedir && <p className="re-act-nota">Disponible cuando la reunión termine de procesarse.</p>}
            </>
          }
        />
        {estado.errorDeAccion && <Aviso enLinea tipo="error" titulo={estado.errorDeAccion} />}
      </div>
    );
  }

  /* ── Redactándose ───────────────────────────────────────────────────── */
  if (acta.estado === "procesando") {
    return (
      <div className="re-act">
        {estilos}
        <Panel titulo="Estamos redactando el acta" nivel={3} icono={FileSignature} tono="violet">
          <div className="re-act-proceso">
            <p className="re-act-etapa" role="status">
              {textoDeEtapaDeActa(acta)}
            </p>
            <BarraProgreso valor={acta.progreso} etiquetaAccesible={`Avance del acta: ${acta.progreso} %`} />
            <p className="re-act-nota">
              Puedes seguir mirando la reunión o salir de esta página: el acta se sigue redactando y, cuando esté lista, también queda en el Historial.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  /* ── Con error ──────────────────────────────────────────────────────── */
  if (acta.estado === "error") {
    return (
      <div className="re-act">
        {estilos}
        <Aviso
          enLinea
          rol={null}
          tipo="error"
          titulo="No pudimos terminar el acta."
          texto={`${acta.error ?? "Inténtalo de nuevo."} Lo que ya se redactó se conserva.`}
          accion={estado.enviando ? undefined : { etiqueta: "Intentar de nuevo", alElegir: () => void reintentar() }}
        />
        {estado.errorDeAccion && <Aviso enLinea tipo="error" titulo={estado.errorDeAccion} />}
      </div>
    );
  }

  /* ── Lista ──────────────────────────────────────────────────────────── */
  const requisitos = acta.requisitos ? requisitosEnOrden(acta.requisitos) : [];
  const cumplimiento = acta.requisitos ? resumenDeRequisitos(acta.requisitos) : null;
  const items: ItemMenu[] = [
    ...(acta.archivos ? [{ etiqueta: "Descargar en markdown", icono: Download, tono: "blue" as const, href: acta.archivos.markdown }] : []),
    { etiqueta: "Redactar de nuevo…", icono: RefreshCw, tono: "violet" as const, nota: "gasta otra generación", alElegir: alRedactarOtraVez },
  ];

  return (
    <div className="re-act">
      {estilos}

      <div className="re-act-barra">
        <p className="re-act-ia">
          <Etiqueta icono={Sparkles} tono="ai">
            Generada con IA
          </Etiqueta>
          <span>{acta.terminadaEn ? `Redactada ${haceCuanto(acta.terminadaEn)}.` : "Lista."}</span>
        </p>
        <div className="acc">
          {acta.archivos && (
            <Boton variante="secundario" icono={ExternalLink} href={acta.archivos.html} nuevaPestana>
              Abrir el documento
            </Boton>
          )}
          <MenuMas etiquetaAccesible="Más acciones del acta" items={items} />
        </div>
      </div>

      <Aviso
        enLinea
        rol={null}
        tipo="info"
        titulo="Revisa el acta antes de firmarla."
        texto="La IA redacta solo con lo que se dijo, pero puede equivocarse: usa los minutos para comprobar cada parte contra el audio. «Abrir el documento» la deja lista para imprimir o guardar como PDF."
      />

      {acta.pendientes.length > 0 && (
        <Panel titulo="Pendientes de verificación" nivel={3} icono={CircleAlert} tono="amber" nota={`${acta.pendientes.length}`}>
          <ul className="re-act-lista">
            {acta.pendientes.map((p, i) => (
              <li key={i}>
                <CircleAlert aria-hidden="true" focusable="false" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {bloques.length > 0 ? (
        <Panel titulo="Acta" nivel={3} icono={FileSignature} tono="slate">
          <article className="re-act-doc" aria-label="Texto del acta">
            <div className="k-md">
              {bloques.map((b, i) => (
                <Bloque key={i} b={b} alIrAlMinuto={alIrAlMinuto} />
              ))}
            </div>
          </article>
        </Panel>
      ) : (
        <Aviso
          enLinea
          tipo="aviso"
          titulo="No pudimos mostrar el texto del acta aquí."
          texto="El documento está listo: ábrelo con «Abrir el documento»."
          accion={{ etiqueta: "Reintentar", alElegir: estado.recargar }}
        />
      )}

      {cumplimiento && requisitos.length > 0 && (
        <Panel titulo="Requisitos de un acta (Ley 675 de 2001)" nivel={3} icono={ShieldCheck} tono="slate" nota={cumplimiento.texto}>
          <ul className="re-act-lista re-act-req">
            {requisitos.map((r, i) => (
              <li key={i} className={r.status === "completo" ? "ok" : undefined}>
                {r.status === "completo" ? <CircleCheck aria-hidden="true" focusable="false" /> : <ListChecks aria-hidden="true" focusable="false" />}
                <span>
                  <b>
                    {r.item}
                    <span className="k-sr">{r.status === "completo" ? " — completo" : " — pendiente"}</span>
                  </b>
                  {r.detail && <small>{r.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
