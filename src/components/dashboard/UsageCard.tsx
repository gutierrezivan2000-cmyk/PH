"use client";

import { CalendarDays, Zap } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { pedirJSON } from "@/components/dashboard/datosIndice";
import {
  Boton,
  ErrorCarga,
  Esqueleto,
  Estado,
  Kpi,
  Kpis,
  Medidor,
  type TipoEstado,
} from "@/components/kit";

export interface UsageData {
  monthlyGenerations: number;
  dailyGenerations: number;
  monthlyTokens: number;
  monthlyCost: number;
  limits: {
    generationsPerDay: number;
    generationsPerMonth: number;
  };
  planStatus?: string;
  planName?: "pro" | "business" | "elite" | null;
  trialEndsAt?: string | null;
  periodEndsAt?: string | null;
}

export const URL_USO = "/api/usage";

/**
 * Pide /api/usage con la caché de 2 s del armazón (`pedirJSON`): el índice
 * lateral ya pide esta misma ruta al entrar, y la pantalla de Suscripción
 * también la lee para marcar el plan actual; así sale una sola petición.
 * Devuelve null si la respuesta no es 2xx o no trae el uso (sin red, 401…).
 */
export function pedirUso(fresco?: boolean): Promise<UsageData | null> {
  return pedirJSON<UsageData>(URL_USO, { fresco }).then((d) =>
    d && d.limits && typeof d.monthlyGenerations === "number" ? d : null
  );
}

/**
 * Estado del plan en palabras (forma + color + palabra) para la cabecera de
 * Suscripción. Fase de pruebas abierta (OPEN_TESTING, lib/plan.ts): hoy todos
 * tienen las funciones Pro —checkSubscriptionAccess devuelve "testing" antes de
 * mirar la base—, pero /api/usage calcula `planStatus` con la fila de
 * suscripción (hasActiveAccess) sin mirar ese interruptor. Así, una fila de
 * prueba antigua o un plan pagado que venció llegan como "trialing",
 * "trial_expired", "grace", "expired"… y nada de eso bloquea hoy: no se pinta
 * cuenta atrás de prueba ni «renovar» en naranja (sería falso).
 * Devuelve null con un plan pagado vigente ("active"): la cabecera dice cuál.
 */
export function estadoDelPlan(usage: UsageData): { texto: string; tipo: TipoEstado } | null {
  const status = usage.planStatus;
  if (status === "active") return null;
  if (status === "beta") return { texto: "Acceso sin restricciones", tipo: "ok" };
  return { texto: "Fase de pruebas · funciones Pro", tipo: "ok" };
}

/**
 * Suscripción pagada que ya no está vigente, dicha en tono neutro (es un hecho
 * de la cuenta, no un bloqueo mientras dure la fase de pruebas):
 * "grace"/"expired" → «vencida»; "past_due"/"canceled" → «inactiva».
 */
export function suscripcionNoVigente(usage: UsageData): "vencida" | "inactiva" | null {
  const status = usage.planStatus;
  if (status === "grace" || status === "expired") return "vencida";
  if (status === "past_due" || status === "canceled") return "inactiva";
  return null;
}

/* Rejilla local del bloque de uso (SPEC §f.6 «medidor», maqueta secundarias d):
   título en las columnas 1–3 y el medidor con la cifra en 4–12; en móvil, apilado. */
const CSS_USO = `
.k-uso { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); align-items: center;
  border-top: 1px solid var(--line-strong); padding: 16px 0 22px; }
.k-uso > .t { grid-column: 1 / 4; min-width: 0; }
.k-uso > .t h2 { margin: 0; }
.k-uso > .t p { margin: 6px 0 0; font-size: 14px; line-height: 1.35; color: var(--ink-2); }
.k-uso > .m { grid-column: 4 / 13; min-width: 0; }
.k-uso .k-kpis { margin: 0; }
@media (max-width: 1180px) {
  .k-uso > .t { grid-column: 1 / 5; }
  .k-uso > .m { grid-column: 5 / 13; }
}
@media (max-width: 860px) {
  .k-uso { display: block; }
  .k-uso > .m { margin-top: 16px; }
}
`;

function Marco({ children, etiqueta }: { children: ReactNode; etiqueta?: string }) {
  return (
    <section className="k-uso" aria-labelledby={etiqueta ? undefined : "k-uso-t"} aria-label={etiqueta}>
      <style href="k-uso-local" precedence="default">
        {CSS_USO}
      </style>
      {children}
    </section>
  );
}

/**
 * Uso del plan (SPEC §f.6 «medidor»). `alCargar` recibe la respuesta de
 * /api/usage cada vez que llega (también tras «Reintentar»): Suscripción la usa
 * para marcar el plan actual sin pedirla por su cuenta.
 */
export function UsageCard({ alCargar }: { alCargar?: (usage: UsageData) => void } = {}) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const alCargarRef = useRef(alCargar);
  useEffect(() => {
    alCargarRef.current = alCargar;
  });
  // Si /api/usage falla, se dice (antes quedaba cargando para siempre).
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    pedirUso(intento > 0).then((d) => {
      if (!vivo) return;
      if (d) {
        setUsage(d);
        alCargarRef.current?.(d);
      } else setFallo(true);
    });
    return () => {
      vivo = false;
    };
  }, [intento]);

  if (!usage) {
    if (fallo) {
      // Sin el filete del bloque: el error de carga ya trae el suyo.
      return (
        <section aria-label="Uso del plan">
          <div>
            <ErrorCarga
              titulo="No pudimos cargar el uso del plan."
              texto="Revisa tu conexión e inténtalo de nuevo."
              acciones={
                <Boton
                  variante="secundario"
                  onClick={() => {
                    setFallo(false);
                    setIntento((n) => n + 1);
                  }}
                >
                  Reintentar
                </Boton>
              }
            />
          </div>
        </section>
      );
    }
    // Esqueleto con la forma real: título a la izquierda y dos filas de medidor.
    return (
      <Marco etiqueta="Uso del plan">
        <div className="t">
          <Esqueleto variante="bloque" etiquetaAccesible="Cargando el uso del plan…" />
        </div>
        <div className="m">
          <div className="k-esq" aria-hidden="true" style={{ gridTemplateColumns: "96px minmax(0, 1fr)", columnGap: 14 }}>
            <i style={{ width: "70%" }} />
            <i style={{ height: 22 }} />
            <i style={{ width: "50%" }} />
            <i style={{ height: 22 }} />
          </div>
        </div>
      </Marco>
    );
  }

  // Beta testers have unrestricted access — show an unlimited state instead of
  // misleading "X / 3" bars.
  if (usage.planStatus === "beta") {
    return (
      <Marco>
        <div className="t">
          <h2 id="k-uso-t" className="k-t22">Uso del plan</h2>
          <p>
            <Estado tipo="ok" tamLetra={14}>Generaciones ilimitadas</Estado>
          </p>
          <p>Durante la fase de prueba.</p>
        </div>
        <div className="m">
          <Kpis>
            <Kpi icono={CalendarDays} tono="violet" cifra={usage.monthlyGenerations} etiqueta="Generaciones este mes" tamLetra={32} />
            <Kpi icono={Zap} tono="amber" cifra={usage.dailyGenerations} etiqueta="Generaciones hoy" tamLetra={32} />
          </Kpis>
        </div>
      </Marco>
    );
  }

  const monthlyRemaining = usage.limits.generationsPerMonth - usage.monthlyGenerations;
  const dailyRemaining = Math.max(0, usage.limits.generationsPerDay - usage.dailyGenerations);
  // El medidor del kit recorta lo usado al tope (también en su cifra): si se
  // generó por encima del tope (p. ej. topes de una fila de prueba antigua, o
  // tras bajar de plan), la cifra real se dice aquí para no ocultarla.
  const excesoMes = usage.monthlyGenerations > usage.limits.generationsPerMonth;
  const excesoHoy = usage.dailyGenerations > usage.limits.generationsPerDay;

  return (
    <Marco>
      <div className="t">
        <h2 id="k-uso-t" className="k-t22">Uso del plan</h2>
        <p>
          {monthlyRemaining > 0 ? (
            // Derivado de /api/usage: tope del plan menos lo generado (mes y día).
            <>
              Generaciones: {monthlyRemaining === 1 ? "queda" : "quedan"} {monthlyRemaining} este mes y{" "}
              {dailyRemaining} hoy.
            </>
          ) : (
            <Estado tipo="vencido" tamLetra={14}>
              {excesoMes
                ? `Límite alcanzado · ${usage.monthlyGenerations} de ${usage.limits.generationsPerMonth} este mes`
                : "Límite alcanzado"}
            </Estado>
          )}
        </p>
        {excesoHoy && (
          <p>
            Hoy: {usage.dailyGenerations} de {usage.limits.generationsPerDay}, por encima del tope diario.
          </p>
        )}
      </div>
      <div className="m">
        <Medidor
          filas={[
            { etiqueta: "Este mes", usado: usage.monthlyGenerations, total: usage.limits.generationsPerMonth },
            { etiqueta: "Hoy", usado: usage.dailyGenerations, total: usage.limits.generationsPerDay },
          ]}
          libres={Math.max(0, monthlyRemaining)}
          unidadLibres="restantes"
        />
      </div>
    </Marco>
  );
}
