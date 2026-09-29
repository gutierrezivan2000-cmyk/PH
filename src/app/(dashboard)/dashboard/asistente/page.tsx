"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/dashboard/Header";
import { AGENTS, AGENT_IDS, INCLUDED_AGENT_IDS } from "@/lib/agents";
import { SUGERENCIAS } from "@/lib/agent-sugerencias";
import {
  BotonSugerencia,
  CabeceraPieza,
  FichaAgente,
  Pagina,
  Panel,
  Pieza,
  type AgenteId,
} from "@/components/kit";

interface AgentUsage {
  daily: number;
  weekly: number;
  limits: { agentMessagesPerDay: number; agentMessagesPerWeek: number };
}

/* Estilos locales de la pantalla (SPEC §g 04, lista de agentes):
   - contador de uso con cifras de 34 px/62 % (como `.stat` de la maqueta);
   - fichas activas en 6 + 6 columnas; las 4 en preparación en 3 columnas cada
     una, en vertical (celda del sigilo achurada arriba), porque a 3 columnas la
     ficha horizontal del kit no deja sitio al nombre. En ≤ 1180 px vuelven a la
     ficha horizontal del kit: dos por fila y, en ≤ 860 px, una. */
const CSS_ASISTENTE = `
.asis-uso { margin: 0; display: grid; gap: 4px; justify-items: end; text-align: right; }
.asis-uso > span { font-size: 13px; color: var(--ink-3); }
.asis-uso > p { margin: 0; display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; justify-content: flex-end;
  font-size: 14px; color: var(--ink-2); white-space: nowrap; }
.asis-uso b { font: 800 34px/1 var(--f-sans); letter-spacing: -.02em; color: var(--ink); }
.asis-uso p > span + b { margin-left: 12px; }
.asis-activos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--g); }
.asis-prep { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--g); margin-top: var(--g); }
.asis-como { margin-top: 56px; max-width: 68ch; }
.asis-como ul { list-style: none; margin: 0; padding: 0; }
.asis-como li { padding: 11px 0; border-bottom: 1px solid var(--line); font-size: 15px; line-height: 1.45; color: var(--ink-2); }
.asis-como li b { color: var(--ink); font-weight: 700; }
@media (min-width: 1181px) {
  .asis-prep .k-agente { grid-template-columns: minmax(0, 1fr); grid-template-rows: 132px minmax(0, 1fr); }
  .asis-prep .k-agente > .sig { min-height: 0; border-right: 0; border-bottom: 1.5px solid var(--line-strong); }
  .asis-prep .k-agente .top { flex-direction: column; align-items: flex-start; gap: 6px; }
  .asis-prep .k-agente .top :is(h2, h3) { font-size: 26px; }
}
@media (max-width: 1180px) {
  .asis-prep { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .asis-uso { justify-items: start; text-align: left; }
  .asis-uso > p { justify-content: flex-start; }
}
@media (max-width: 860px) {
  .asis-uso { justify-items: start; text-align: left; }
  .asis-uso > p { justify-content: flex-start; }
  .asis-activos, .asis-prep { grid-template-columns: minmax(0, 1fr); }
  .asis-como { margin-top: 40px; }
}
`;

export default function AsistentePage() {
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [accessible, setAccessible] = useState<string[]>([...INCLUDED_AGENT_IDS]);

  useEffect(() => {
    fetch("/api/agents/usage")
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data.daily === "number" && data.limits) {
          setUsage({ daily: data.daily, weekly: data.weekly, limits: data.limits });
        }
        if (Array.isArray(data?.accessibleAgents)) {
          setAccessible(data.accessibleAgents);
        }
      })
      .catch(console.error);
  }, []);

  // Mismo criterio de siempre: con acceso = ficha activa; sin acceso = «Próximamente».
  const activos = AGENT_IDS.filter((id) => accessible.includes(id));
  const enPreparacion = AGENT_IDS.filter((id) => !accessible.includes(id));
  const incluidos = INCLUDED_AGENT_IDS.map((id) => AGENTS[id].name);

  const subtitulo = [
    `${activos.length} ${activos.length === 1 ? "activo" : "activos"}`,
    enPreparacion.length > 0 ? `${enPreparacion.length} en preparación` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Header title="Asistente IA" />
      <style href="asistente-lista" precedence="default">
        {CSS_ASISTENTE}
      </style>
      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="04"
            titulo="Asistente IA"
            subtitulo={subtitulo}
            acciones={
              // Uso real de /api/agents/usage (mensajes enviados hoy y esta semana frente al límite del plan).
              usage && (
                <div className="asis-uso">
                  <span>Mensajes a los agentes</span>
                  <p>
                    <b>{usage.daily}</b>
                    <span>de {usage.limits.agentMessagesPerDay} hoy</span>
                    <b>{usage.weekly}</b>
                    <span>de {usage.limits.agentMessagesPerWeek} esta semana</span>
                  </p>
                </div>
              )
            }
          />

          {activos.length > 0 && (
            <section aria-labelledby="asis-activos-t">
              <h2 id="asis-activos-t" className="k-sr">
                Agentes activos
              </h2>
              <div className="asis-activos">
                {activos.map((id) => (
                  <FichaAgente
                    key={id}
                    agente={id as AgenteId}
                    href={`/dashboard/asistente/${id}`}
                    sugerencias={(SUGERENCIAS[id] || []).slice(0, 3).map((s) => (
                      // Abre el chat con la pregunta escrita en el redactor (no se envía sola).
                      <BotonSugerencia
                        key={s.titulo}
                        href={`/dashboard/asistente/${id}?pregunta=${encodeURIComponent(s.prompt)}`}
                      >
                        {s.titulo}
                      </BotonSugerencia>
                    ))}
                  />
                ))}
              </div>
            </section>
          )}

          {enPreparacion.length > 0 && (
            <section aria-labelledby="asis-prep-t">
              <h2 id="asis-prep-t" className="k-sr">
                Agentes en preparación
              </h2>
              <div className="asis-prep">
                {enPreparacion.map((id) => (
                  <FichaAgente key={id} agente={id as AgenteId} activo={false} />
                ))}
              </div>
            </section>
          )}

          <Panel titulo="Cómo funcionan los agentes" nivel={2} className="asis-como">
            <ul>
              <li>Cada agente tiene su propia especialidad y recuerda el contexto de tus conversaciones anteriores.</li>
              <li>Puedes crear múltiples chats con cada agente para organizar tus consultas por tema.</li>
              <li>Los agentes pueden recibir imágenes y documentos como parte de la conversación.</li>
              <li>La memoria del agente guarda notas importantes que persisten entre sesiones.</li>
              <li>
                Tu plan incluye{" "}
                {incluidos.map((n, i) => (
                  <span key={n}>
                    {i > 0 && (i === incluidos.length - 1 ? " y " : ", ")}
                    <b>{n}</b>
                  </span>
                ))}
                . Los demás agentes estarán disponibles próximamente.
              </li>
            </ul>
          </Panel>
        </Pieza>
      </Pagina>
    </>
  );
}
