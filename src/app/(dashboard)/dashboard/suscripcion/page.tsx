"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import { Header } from "@/components/dashboard/Header";
import { UsageCard, estadoDelPlan, type UsageData } from "@/components/dashboard/UsageCard";
import { COMING_SOON_AGENT_IDS } from "@/lib/agents";
import {
  Aviso,
  Boton,
  CabeceraPieza,
  Cuadro,
  Estado,
  FranjaPreparacion,
  Pagina,
  Pieza,
  Reticula,
  TarjetaPlan,
  type AgenteId,
} from "@/components/kit";
import Script from "next/script";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

declare global {
  interface Window {
    ePayco?: {
      checkout: {
        configure: (config: { key: string; test: boolean }) => {
          open: (data: Record<string, string>) => void;
        };
      };
    };
  }
}

type PlanId = "pro" | "business" | "elite";

const PLAN_CARDS: {
  id: PlanId;
  label: string;
  priceCop: string;
  usd: string;
  tagline: string;
  cta: string;
  featured: boolean;
  ribbon?: string;
  features: string[];
}[] = [
  {
    id: "pro",
    label: "Pro",
    priceCop: "99.900",
    usd: "aprox. USD 24 al mes",
    tagline: "Para empezar",
    cta: "Empezar gratis",
    featured: false,
    features: [
      "Hasta 3 propiedades",
      "15 generaciones al mes (3 por día)",
      "Themis y Chronos incluidos",
      "Soporte por chat",
    ],
  },
  {
    id: "business",
    label: "Business",
    priceCop: "299.900",
    usd: "aprox. USD 73 al mes",
    tagline: "Para administradores en crecimiento",
    cta: "Subir a Business",
    featured: true,
    ribbon: "Recomendado · de 4 a 10 propiedades",
    features: [
      "Hasta 10 propiedades",
      "40 generaciones al mes (5 por día)",
      "Themis y Chronos incluidos",
      "Generación en lote",
      "Soporte prioritario",
    ],
  },
  {
    id: "elite",
    label: "Élite",
    priceCop: "749.900",
    usd: "aprox. USD 183 al mes",
    tagline: "Para grandes administradores",
    cta: "Subir a Élite",
    featured: false,
    features: [
      "Propiedades ilimitadas",
      "100 generaciones al mes (10 por día)",
      "Themis y Chronos incluidos",
      "Generación en lote",
      "Soporte prioritario · WhatsApp directo",
    ],
  },
];

const NOMBRE_PLAN: Record<PlanId, string> = { pro: "Pro", business: "Business", elite: "Élite" };

// Agentes «Próximamente», de la configuración real (lib/agents).
const AGENTES_PROXIMAMENTE = COMING_SOON_AGENT_IDS as AgenteId[];

/**
 * Estados de /api/usage que significan «sin plan pagado». En la fase de pruebas
 * abierta (OPEN_TESTING, lib/plan.ts) todo el mundo tiene las funciones Pro
 * —es lo que dice la tarjeta Pro: «Gratis en pruebas»—; la API no expone el
 * interruptor al cliente, así que se reconoce por el estado: "testing", "none",
 * "unknown" o ninguno (la demo no lo envía).
 */
const SIN_PLAN_PAGADO = new Set<string | undefined>([undefined, "testing", "none", "unknown"]);

/* Rejilla de planes: 3 × 4 columnas; en móvil (k-r12 pasa a una columna) se apilan. */
const CSS_SUSCRIPCION = `
.k-susc-sub { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
.k-planes { row-gap: 16px; margin-top: 26px; }
.k-planes > div { grid-column: span 4; display: flex; min-width: 0; }
.k-planes > div > .k-plan { flex: 1 1 auto; }
.k-plan .k-pie-actual { display: grid; gap: 10px; }
.k-susc-nota { margin: 14px 0 0; font-size: 14px; line-height: 1.4; color: var(--ink-2); max-width: 78ch; }
.k-susc-prep { margin-top: 32px; }
.k-susc-prep + p { margin: 10px 0 0; font-size: 14px; line-height: 1.4; color: var(--ink-3); }
`;

export default function SuscripcionPage() {
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  // Track ePayco readiness, but never let it permanently disable the buttons:
  // on SPA re-mount next/script's onLoad won't fire again, so we also seed the
  // state from window on mount and fall back to a click-time check.
  const [epaycoReady, setEpaycoReady] = useState(false);
  const [error, setError] = useState("");
  // Uso y estado del plan: la misma respuesta de /api/usage que pinta UsageCard.
  const [uso, setUso] = useState<{ datos: UsageData; leidoEn: number } | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ePayco) setEpaycoReady(true);
  }, []);

  const handleSubscribe = useCallback(async (planType: PlanId) => {
    setLoadingPlan(planType);
    setError("");
    try {
      const res = await fetch("/api/epayco/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planType }),
      });
      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      if (!data.checkoutConfig || !data.publicKey) {
        setError("Error de configuración. Intenta de nuevo.");
        return;
      }
      if (!window.ePayco) {
        setError("El módulo de pago aún no ha cargado. Espera unos segundos e intenta de nuevo.");
        return;
      }

      const handler = window.ePayco.checkout.configure({
        key: data.publicKey,
        test: data.isTest,
      });
      handler.open(data.checkoutConfig);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoadingPlan(null);
    }
  }, []);

  /* ── Plan actual (de /api/usage) ──────────────────────────────────────
     · plan pagado y vigente (planStatus "active" + planName) → ese plan;
     · sin plan pagado, en la fase de pruebas → Pro (ver SIN_PLAN_PAGADO);
     · beta, prueba, gracia, vencido… → ninguno: su estado va en la cabecera. */
  const datos = uso?.datos;
  const pagado = datos?.planStatus === "active" && datos.planName ? datos.planName : null;
  const enPruebas = Boolean(datos) && !pagado && SIN_PLAN_PAGADO.has(datos?.planStatus);
  const planActual: PlanId | null = pagado ?? (enPruebas ? "pro" : null);
  const estado = uso ? estadoDelPlan(uso.datos, uso.leidoEn) : null;

  let subtitulo: ReactNode = "Gestiona tu plan y uso";
  if (pagado) {
    const hasta = datos?.periodEndsAt
      ? new Date(datos.periodEndsAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
      : null;
    subtitulo = `Plan ${NOMBRE_PLAN[pagado]}${hasta ? ` · vigente hasta el ${hasta}` : ""}`;
  } else if (enPruebas) {
    subtitulo = (
      <span className="k-susc-sub">
        <span>Plan Pro</span>
        <span className="k-sr"> · </span>
        <Estado tipo="ok">Fase de pruebas · funciones Pro</Estado>
      </span>
    );
  } else if (estado) {
    subtitulo = (
      <span className="k-susc-sub">
        {datos?.planName && (
          <>
            <span>Plan {NOMBRE_PLAN[datos.planName]}</span>
            <span className="k-sr"> · </span>
          </>
        )}
        <Estado tipo={estado.tipo}>{estado.texto}</Estado>
      </span>
    );
  }

  return (
    <div>
      {!IS_DEMO && (
        <Script
          src="https://checkout.epayco.co/checkout.js"
          onReady={() => setEpaycoReady(true)}
          onLoad={() => setEpaycoReady(true)}
          strategy="afterInteractive"
        />
      )}
      <style href="k-suscripcion-local" precedence="default">
        {CSS_SUSCRIPCION}
      </style>

      <Header title="Suscripción" />

      <Pagina>
        <Pieza>
          <CabeceraPieza nn="14" titulo="Suscripción" subtitulo={subtitulo} />

          {IS_DEMO && (
            <div style={{ marginBottom: 24 }}>
              <Aviso
                enLinea
                rol={null}
                tipo="info"
                titulo="Demo activo."
                texto="Puedes ver los planes, pero en la demostración no se procesan pagos."
              />
            </div>
          )}

          <UsageCard alCargar={(datos) => setUso({ datos, leidoEn: Date.now() })} />

          <h2 className="k-sr">Planes</h2>

          {error && (
            <div style={{ marginTop: 16 }}>
              <Aviso enLinea tipo="error" titulo="No se pudo iniciar el pago." texto={error} />
            </div>
          )}

          {/* ── Planes ────────────────────────────────────────────────── */}
          <Reticula className="k-planes">
            {PLAN_CARDS.map((plan) => {
              const isLoading = loadingPlan === plan.id;
              const esActual = planActual === plan.id;
              const boton = (
                <Boton
                  variante={plan.featured ? "primario" : "secundario"}
                  flecha="avanza"
                  onClick={() => handleSubscribe(plan.id)}
                  disabled={IS_DEMO || (loadingPlan !== null && !isLoading)}
                  cargando={isLoading}
                  textoCargando="Procesando…"
                >
                  {plan.cta}
                </Boton>
              );
              const gratis =
                plan.id === "pro" ? <Estado tipo="ok" tamLetra={14}>Gratis en pruebas</Estado> : null;
              // En la fase de pruebas Pro es el plan actual, pero se conserva su acción
              // «Empezar gratis» (fuera de la demo): marca de plan actual + el botón.
              const pie =
                esActual && !pagado ? (
                  <div className="k-pie-actual">
                    {gratis}
                    <div className="actual">
                      <span>Tu plan actual</span>
                      <Cuadro tipo="ok" />
                    </div>
                    {!IS_DEMO && boton}
                  </div>
                ) : gratis ? (
                  <div className="k-pie-actual">
                    {gratis}
                    {boton}
                  </div>
                ) : (
                  boton
                );
              return (
                <div key={plan.id}>
                  <TarjetaPlan
                    id={`plan-${plan.id}`}
                    nombre={plan.label}
                    para={plan.tagline}
                    precio={plan.priceCop}
                    equivalencia={plan.usd}
                    beneficios={plan.features}
                    recomendado={plan.featured ? plan.ribbon : undefined}
                    actual={esActual && Boolean(pagado)}
                    className={esActual && !pagado && !plan.featured ? "es-actual" : undefined}
                    accion={pie}
                  />
                </div>
              );
            })}
          </Reticula>

          <p className="k-susc-nota">
            El administrador factura por propiedad. Cobro en COP procesado por ePayco: acepta tarjetas de crédito,
            débito, PSE y más.
          </p>

          {AGENTES_PROXIMAMENTE.length > 0 && (
            <>
              <FranjaPreparacion
                className="k-susc-prep"
                rotulo="Más agentes"
                nota="· próximamente, como complementos de tu plan"
                agentes={AGENTES_PROXIMAMENTE}
              />
              <p>Te avisaremos cuando estén disponibles.</p>
            </>
          )}
        </Pieza>
      </Pagina>
    </div>
  );
}
