"use client";

import { ArrowUpRight, CircleAlert, CircleCheck, Clock, FileText, Gavel, ListChecks, ListOrdered, Sparkles, Users, Vote } from "lucide-react";
import { Aviso, Boton, Etiqueta, Kpi, Kpis, Panel, Tabla, Vacio } from "@/components/kit";
import type { Ficha, HablanteDTO, ReunionDetalle } from "@/lib/meetings/dto";
import {
  cifrasDeResumen, enOrdenDeMinuto, estadoDelResumen, minutoDeHallazgo, ordenDelDiaEnOrden, parrafosDeResumen, sePuedeReintentarElResumen,
  textoDeVotos, type CifraDeResumen,
} from "@/lib/meetings/resumen-pantalla";

const CSS = `
.re-res { display: grid; gap: 18px; }
.re-res-ia { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0 0 12px; font-size: 14px; color: var(--ink-3); }
.re-res-parrafos { display: grid; gap: 12px; margin: 0; }
.re-res-parrafos > p { margin: 0; max-width: 74ch; font-size: 16px; line-height: 1.6; color: var(--ink); }
.re-res-lista { list-style: none; margin: 0; padding: 0; }
.re-res-fila { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: 4px 14px; padding: 14px 0; border-bottom: 1px solid var(--line); }
.re-res-fila:first-child { padding-top: 4px; }
.re-res-fila:last-child { padding-bottom: 4px; border-bottom: 0; }
.re-res-id { min-width: 34px; padding-top: 2px; font-size: 13.5px; font-weight: 700; color: var(--ink-3); font-feature-settings: "tnum" 1; }
.re-res-texto { margin: 0; max-width: 74ch; font-size: 15.5px; line-height: 1.5; color: var(--ink); }
.re-res-detalle { margin: 2px 0 0; font-size: 14px; color: var(--ink-3); }
.re-res-nada { color: var(--ink-3); }
.re-min { display: inline-flex; align-items: center; gap: 4px; min-height: 36px; padding: 0 11px 0 12px; border: 0; border-radius: 999px; background: rgb(var(--accent-rgb) / .10); font: inherit; font-size: 13.5px; font-weight: 600; color: var(--accent-text); font-feature-settings: "tnum" 1; white-space: nowrap; cursor: pointer; }
.re-min > svg { width: 14px; height: 14px; flex: none; }
.re-min:hover { background: rgb(var(--accent-rgb) / .18); }
.re-min:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (pointer: coarse) { .re-min { min-height: 40px; } }
.re-res-gente { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
.re-res-gente > li { display: grid; gap: 1px; min-width: 0; padding: 10px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-1); }
.re-res-gente b { font-size: 15px; font-weight: 600; color: var(--ink); }
.re-res-gente span { font-size: 13.5px; color: var(--ink-3); }
.re-res-pendientes { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; }
.re-res-pendientes > li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 10px; font-size: 15px; line-height: 1.5; color: var(--ink-2); }
.re-res-pendientes svg { width: 18px; height: 18px; margin-top: 2px; color: var(--ink-3); }
.re-res-voto { display: grid; gap: 2px; }
@media (max-width: 560px) {
  .re-res-fila { grid-template-columns: auto minmax(0, 1fr); }
  .re-res-fila > .re-min { grid-column: 2; justify-self: start; margin-top: 6px; }
}
`;

const ICONO_DE_CIFRA: Record<CifraDeResumen["clave"], typeof Clock> = { duracion: Clock, participantes: Users, decisiones: CircleCheck, compromisos: ListChecks };

/** El minuto de un hallazgo: un botón que lleva a ese minuto de la transcripción. */
function Minuto({ segundos, alIr }: { segundos: number; alIr: (ms: number) => void }) {
  const texto = minutoDeHallazgo(segundos);
  return (
    <button type="button" className="re-min" aria-label={`Ir al minuto ${texto} de la transcripción`} onClick={() => alIr(Math.max(0, segundos) * 1000)}>
      {texto}
      <ArrowUpRight aria-hidden="true" focusable="false" />
    </button>
  );
}

const SinDefinir = ({ texto }: { texto: string }) => <span className="re-res-nada">{texto}</span>;

/**
 * El resumen de la reunión, a partir de la ficha que armó la IA: cifras, el resumen, y cada decisión, compromiso y
 * votación con su minuto, que lleva a ese punto de la transcripción. Si la IA no pudo, lo dice y deja volver a intentarlo.
 */
export function TabResumen({
  meeting, digest, speakers, alIrAlMinuto, alReintentar, reintentando,
}: {
  meeting: ReunionDetalle["meeting"];
  digest: Ficha | null;
  speakers: HablanteDTO[];
  alIrAlMinuto: (ms: number) => void;
  alReintentar: () => void;
  reintentando: boolean;
}) {
  const estado = estadoDelResumen(meeting, digest);
  const omitidos = digest?.fragmentosOmitidos ?? 0;
  const cifras = cifrasDeResumen(meeting.durationMs, digest, speakers);
  const decisiones = digest ? enOrdenDeMinuto(digest.decisiones) : [];
  const compromisos = digest ? enOrdenDeMinuto(digest.compromisos) : [];
  const votaciones = digest ? enOrdenDeMinuto(digest.votaciones) : [];
  const temas = digest ? ordenDelDiaEnOrden(digest.ordenDelDia) : [];

  return (
    <div className="re-res">
      <style href="k-reuniones-resumen-local" precedence="default">
        {CSS}
      </style>

      <Kpis>
        {cifras.map((c) => (
          <Kpi key={c.clave} icono={ICONO_DE_CIFRA[c.clave]} tono="slate" cifra={c.cifra} etiqueta={c.etiqueta} />
        ))}
      </Kpis>

      {estado === "fallo" && (
        <Aviso
          enLinea
          rol={null}
          tipo="aviso"
          titulo="Falta el resumen de la reunión."
          texto={meeting.errorMessage ?? "La IA no pudo generarlo."}
          accion={
            sePuedeReintentarElResumen(estado) && !reintentando
              ? { etiqueta: "Generar el resumen otra vez", alElegir: alReintentar }
              : undefined
          }
        />
      )}
      {estado === "parcial" && (
        <Aviso
          enLinea
          rol={null}
          tipo="aviso"
          titulo={`Faltó analizar ${omitidos} ${omitidos === 1 ? "fragmento" : "fragmentos"} de la reunión.`}
          texto="Lo que se habló en ellos no está en el resumen (lo ves en «Por confirmar»); la transcripción sí está completa."
          accion={!reintentando ? { etiqueta: "Analizar lo que faltó", alElegir: alReintentar } : undefined}
        />
      )}
      {(estado === "fallo" || estado === "parcial") && reintentando && (
        <Aviso enLinea tipo="info" titulo="Pidiendo el análisis otra vez…" texto="Solo se vuelve a analizar lo que faltó." />
      )}
      {estado === "sin_contenido" && (
        <Aviso enLinea rol={null} tipo="info" titulo="La IA no encontró temas, decisiones ni compromisos en esta reunión." texto="La transcripción completa está en la pestaña Transcripción." />
      )}
      {estado === "corta" && (
        <Vacio
          icono={FileText}
          tono="slate"
          titulo="Esta grabación es muy corta para resumirla."
          texto="Con unas pocas palabras no hay qué resumir. La transcripción completa está en la pestaña Transcripción."
          acciones={
            <Boton variante="secundario" onClick={() => alIrAlMinuto(0)}>
              Ver la transcripción
            </Boton>
          }
        />
      )}

      {digest && (estado === "completo" || estado === "parcial") && (
        <Panel titulo="Resumen" icono={FileText} tono="slate">
          <p className="re-res-ia">
            <Etiqueta icono={Sparkles} tono="ai">
              Generado con IA
            </Etiqueta>
            <span>Revísalo contra la transcripción antes de usarlo en un acta.</span>
          </p>
          <div className="re-res-parrafos">
            {parrafosDeResumen(digest.resumen).map((p, k) => (
              <p key={k}>{p}</p>
            ))}
          </div>
        </Panel>
      )}

      {decisiones.length > 0 && (
        <Panel titulo="Decisiones" icono={Gavel} tono="slate" nota={`${decisiones.length}`}>
          <ol className="re-res-lista">
            {decisiones.map((d) => (
              <li key={d.id} className="re-res-fila">
                <span className="re-res-id">{d.id}</span>
                <p className="re-res-texto">{d.texto}</p>
                <Minuto segundos={d.t} alIr={alIrAlMinuto} />
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {compromisos.length > 0 && (
        <Panel titulo="Compromisos" icono={ListChecks} tono="slate" nota={`${compromisos.length}`}>
          <Tabla
            etiquetaAccesible="Compromisos de la reunión"
            filas={compromisos}
            claveFila={(c) => c.id}
            columnas={[
              { id: "id", titulo: "N.º", ancho: "52px", principal: true, claseCelda: "k-c-id", celda: (c) => c.id },
              { id: "texto", titulo: "Compromiso", ancho: "minmax(0, 4fr)", celda: (c) => c.texto },
              { id: "responsable", titulo: "Responsable", ancho: "minmax(0, 1.5fr)", celda: (c) => c.responsable || <SinDefinir texto="Sin definir" /> },
              { id: "fecha", titulo: "Fecha", ancho: "minmax(0, 1.3fr)", celda: (c) => c.fecha || <SinDefinir texto="Sin fecha" /> },
              { id: "minuto", titulo: "Minuto", ancho: "auto", alinear: "fin", celda: (c) => <Minuto segundos={c.t} alIr={alIrAlMinuto} /> },
            ]}
          />
        </Panel>
      )}

      {votaciones.length > 0 && (
        <Panel titulo="Votaciones" icono={Vote} tono="slate" nota={`${votaciones.length}`}>
          <Tabla
            etiquetaAccesible="Votaciones de la reunión"
            filas={votaciones}
            claveFila={(v) => `${v.t}-${v.asunto}`}
            columnas={[
              { id: "asunto", titulo: "Asunto", ancho: "minmax(0, 3fr)", principal: false, celda: (v) => v.asunto },
              {
                id: "resultado",
                titulo: "Resultado",
                ancho: "minmax(0, 2.4fr)",
                celda: (v) => (
                  <span className="re-res-voto">
                    <span>{v.resultado}</span>
                    {textoDeVotos(v) && <span className="re-res-detalle">{textoDeVotos(v)}</span>}
                  </span>
                ),
              },
              { id: "minuto", titulo: "Minuto", ancho: "auto", alinear: "fin", celda: (v) => <Minuto segundos={v.t} alIr={alIrAlMinuto} /> },
            ]}
          />
        </Panel>
      )}

      {temas.length > 0 && (
        <Panel titulo="Temas tratados" icono={ListOrdered} tono="slate" nota={`${temas.length}`}>
          <ol className="re-res-lista">
            {temas.map((t, k) => (
              <li key={`${t.inicioS}-${k}`} className="re-res-fila">
                <span className="re-res-id">{k + 1}</span>
                <p className="re-res-texto">{t.titulo}</p>
                <Minuto segundos={t.inicioS} alIr={alIrAlMinuto} />
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {digest && digest.asistentes.length > 0 && (
        <Panel titulo="Participantes" icono={Users} tono="slate" nota={`${digest.asistentes.length}`}>
          <ul className="re-res-gente">
            {digest.asistentes.map((a, k) => (
              <li key={`${a.nombre}-${k}`}>
                <b>{a.nombre}</b>
                {a.rol && <span>{a.rol}</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {digest && digest.pendientes.length > 0 && (
        <Panel titulo="Por confirmar" icono={CircleAlert} tono="slate" nota="lo que la IA no pudo verificar">
          <ul className="re-res-pendientes">
            {digest.pendientes.map((p, k) => (
              <li key={k}>
                <CircleAlert aria-hidden="true" focusable="false" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

