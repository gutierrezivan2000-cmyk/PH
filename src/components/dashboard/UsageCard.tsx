"use client";

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
 * Estado del plan en palabras: los mismos casos y textos que tenía el chip de
 * estado (ahora en caja normal, con forma + color + palabra). `ahora` es el
 * momento de la lectura (Date.now fuera del render).
 */
export function estadoDelPlan(
  usage: UsageData,
  ahora: number
): { texto: string; tipo: TipoEstado } | null {
  const status = usage.planStatus;
  if (!status) return null;

  // Fase de pruebas abierta: sin cuenta atrás ni aviso de vencimiento, porque
  // no hay nada que venza. Se dice qué tiene abierto y por qué.
  if (status === "testing") return { texto: "Fase de pruebas · funciones Pro", tipo: "ok" };

  if (status === "trialing" && usage.trialEndsAt) {
    const daysLeft = Math.max(0, Math.ceil((new Date(usage.trialEndsAt).getTime() - ahora) / 86400000));
    const urgent = daysLeft <= 2;
    return {
      texto: `Prueba gratis · ${daysLeft === 0 ? "termina hoy" : `${daysLeft} día${daysLeft === 1 ? "" : "s"}`}`,
      tipo: urgent ? "falta" : "pendiente",
    };
  }

  if (status === "grace") return { texto: "Plan vencido · renovar (período de gracia)", tipo: "vencido" };

  if (status === "trial_expired" || status === "past_due" || status === "canceled" || status === "expired") {
    const texto =
      status === "trial_expired"
        ? "Prueba finalizada · elige un plan"
        : status === "expired"
        ? "Plan vencido · renovar"
        : "Plan inactivo · reactivar";
    return { texto, tipo: "vencido" };
  }

  if (status === "beta") return { texto: "Acceso sin restricciones", tipo: "ok" };

  return null;
}

/* Rejilla local del bloque de uso (SPEC §f.6 «medidor», maqueta secundarias d):
   título en las columnas 1–3 y el medidor con la cifra en 4–12; en móvil, apilado. */
const CSS_USO = `
.k-uso { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); align-items: center;
  border-top: 2px solid var(--rule); padding: 16px 0 22px; }
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
            <Kpi cifra={usage.monthlyGenerations} etiqueta="Generaciones este mes" tamLetra={32} />
            <Kpi cifra={usage.dailyGenerations} etiqueta="Generaciones hoy" tamLetra={32} />
          </Kpis>
        </div>
      </Marco>
    );
  }

  const monthlyRemaining = usage.limits.generationsPerMonth - usage.monthlyGenerations;
  const dailyRemaining = Math.max(0, usage.limits.generationsPerDay - usage.dailyGenerations);

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
            <Estado tipo="vencido" tamLetra={14}>Límite alcanzado</Estado>
          )}
        </p>
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
