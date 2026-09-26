"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/dashboard/Header";
import { normalizePlanId } from "@/lib/plan";
import {
  Aviso,
  CabeceraPieza,
  Esqueleto,
  Estado,
  Flecha,
  Pagina,
  Panel,
  Pieza,
  Reticula,
  Resumen,
  type TipoAviso,
  type TipoEstado,
} from "@/components/kit";

type EstadoPago = "loading" | "approved" | "rejected" | "pending" | "error";

/**
 * Datos de la transacción que ya trae la respuesta de validación de ePayco
 * (la misma llamada de siempre): x_extra2 es el idPlan que manda nuestro
 * checkout, x_amount/x_currency_code el valor cobrado, x_transaction_date la
 * fecha, x_bank_name/x_franchise el medio. Si un campo no llega, no se pinta.
 */
type DetallePago = { plan?: string; valor?: string; fecha?: string; medio?: string };

const NOMBRE_PLAN = { pro: "Pro", business: "Business", elite: "Élite" } as const;
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function texto(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;
}

/** «2026-09-26 10:42:31» → «26 de septiembre de 2026 · 10:42» (sin cambiar de zona horaria). */
function fechaLegible(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return v;
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return v;
  return `${Number(m[3])} de ${mes} de ${m[1]}${m[4] ? ` · ${m[4]}:${m[5]}` : ""}`;
}

function detalleDe(data: Record<string, unknown>): DetallePago {
  const plan = normalizePlanId(texto(data.x_extra2));
  const monto = Number(texto(data.x_amount));
  const moneda = (texto(data.x_currency_code) ?? "COP").toUpperCase();
  return {
    plan: plan ? `Plan ${NOMBRE_PLAN[plan]}` : texto(data.x_description),
    valor: Number.isFinite(monto) && monto > 0
      ? `${moneda} ${monto.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`
      : undefined,
    fecha: fechaLegible(texto(data.x_transaction_date)),
    medio: [texto(data.x_bank_name), texto(data.x_franchise)].filter(Boolean).join(" · ") || undefined,
  };
}

const TITULOS: Record<EstadoPago, string> = {
  loading: "Verificando el pago…",
  approved: "Pago aprobado",
  rejected: "Pago rechazado",
  pending: "Pago pendiente",
  error: "No pudimos verificar el pago",
};

/* Estado = forma + color + palabra (SPEC §f.8) y aviso con borde de 8 px (§f.14). */
const ESTADO: Record<EstadoPago, { tipo: TipoEstado; palabra: string; aviso: TipoAviso }> = {
  loading: { tipo: "enCurso", palabra: "Verificando", aviso: "info" },
  approved: { tipo: "ok", palabra: "Aprobado", aviso: "ok" },
  rejected: { tipo: "vencido", palabra: "Rechazado", aviso: "error" },
  pending: { tipo: "pendiente", palabra: "Pendiente", aviso: "info" },
  error: { tipo: "vencido", palabra: "Error", aviso: "error" },
};

/* Resumen a la izquierda (7 columnas) y estado a la derecha (5), SPEC §g 14 «Pago ePayco».
   En el DOM va primero el estado: en móvil (una columna) es lo primero que se lee. */
const CSS_PAGO = `
.k-pago { row-gap: 32px; }
.k-pago > .estado { grid-column: 8 / 13; grid-row: 1; min-width: 0; }
.k-pago > .resumen { grid-column: 1 / 8; grid-row: 1; min-width: 0; }
.k-pago .acc { margin-top: 18px; }
.k-pago .ref { font-family: var(--f-mono); font-size: 14px; overflow-wrap: anywhere; }
@media (max-width: 860px) {
  .k-pago > .estado, .k-pago > .resumen { grid-row: auto; }
}
`;

function VistaPago({
  status,
  message,
  refPayco,
  detalle,
}: {
  status: EstadoPago;
  message: string;
  refPayco: string | null;
  detalle: DetallePago | null;
}) {
  const e = ESTADO[status];
  // Primera frase en negrita (SPEC §f.14); el resto del mensaje, detrás.
  const corte = message.indexOf(". ");
  const tituloAviso = status === "loading" ? TITULOS.loading : corte > 0 ? message.slice(0, corte + 1) : message;
  const textoAviso = status !== "loading" && corte > 0 ? message.slice(corte + 2) : undefined;

  const filas: Array<{ etiqueta: ReactNode; valor: ReactNode }> = [
    { etiqueta: "Estado", valor: <Estado tipo={e.tipo}>{e.palabra}</Estado> },
  ];
  if (detalle?.plan) filas.push({ etiqueta: "Plan", valor: detalle.plan });
  if (detalle?.valor) filas.push({ etiqueta: "Valor", valor: detalle.valor });
  if (detalle?.fecha) filas.push({ etiqueta: "Fecha", valor: detalle.fecha });
  if (detalle?.medio) filas.push({ etiqueta: "Medio de pago", valor: detalle.medio });
  if (refPayco && status !== "loading") {
    filas.push({ etiqueta: "Referencia", valor: <span className="ref">{refPayco}</span> });
  }

  return (
    <>
      <style href="k-pago-local" precedence="default">
        {CSS_PAGO}
      </style>
      <CabeceraPieza nn="14" titulo={TITULOS[status]} subtitulo="Resultado del pago con ePayco" />
      <Reticula className="k-pago">
        <div className="estado">
          <Panel titulo="Estado del pago" nivel={2}>
            <div style={{ marginTop: 14 }}>
              {status === "loading" ? (
                <Esqueleto variante="bloque" etiquetaAccesible="Verificando el pago…" />
              ) : (
                <Aviso enLinea tipo={e.aviso} titulo={tituloAviso} texto={textoAviso} />
              )}
            </div>
            <div className="acc k-btns">
              {/* Enlaces completos (no navegación de cliente): al volver, todo se relee con el plan nuevo. */}
              <a href="/dashboard" className="k-btn">
                <span>Ir al inicio</span>
                <Flecha tipo="avanza" />
              </a>
              <a href="/dashboard/suscripcion" className="k-btn k-sec">
                <span>Ir a Suscripción</span>
              </a>
            </div>
          </Panel>
        </div>
        <div className="resumen">
          <Panel titulo="Resumen del pago" nivel={2}>
            <div style={{ marginTop: 14 }}>
              {status === "loading" ? (
                <Esqueleto variante="bloque" etiquetaAccesible="Cargando el resumen del pago…" />
              ) : (
                <Resumen etiquetaAccesible="Resumen del pago" filas={filas} />
              )}
            </div>
          </Panel>
        </div>
      </Reticula>
    </>
  );
}

function ResponseContent() {
  const searchParams = useSearchParams();
  const refPayco = searchParams.get("ref_payco");
  const [status, setStatus] = useState<"loading" | "approved" | "rejected" | "pending" | "error">("loading");
  const [message, setMessage] = useState("");
  const [detalle, setDetalle] = useState<DetallePago | null>(null);

  useEffect(() => {
    // Sin referencia no hay nada que verificar (el error se pinta abajo, sin estado).
    if (!refPayco) return;

    fetch(`https://secure.epayco.co/validation/v1/reference/${refPayco}`)
      .then((res) => res.json())
      .then((result) => {
        if (!result.success) {
          setStatus("error");
          setMessage("No se pudo verificar la transacción.");
          return;
        }
        if (result.data && typeof result.data === "object") setDetalle(detalleDe(result.data));
        const cod = String(result.data.x_cod_response);
        if (cod === "1") {
          setStatus("approved");
          setMessage("Tu suscripción ha sido activada exitosamente.");
        } else if (cod === "3") {
          setStatus("pending");
          setMessage("Tu pago está siendo procesado. Te notificaremos cuando se confirme.");
        } else {
          setStatus("rejected");
          setMessage(result.data.x_response_reason_text || "El pago fue rechazado.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Error al verificar el pago. Contacta a soporte.");
      });
  }, [refPayco]);

  if (!refPayco) {
    return <VistaPago status="error" message="No se recibió referencia de pago." refPayco={null} detalle={null} />;
  }
  return <VistaPago status={status} message={message} refPayco={refPayco} detalle={detalle} />;
}

export default function EpaycoResponsePage() {
  return (
    <div>
      <Header title="Resultado del pago" breadcrumbs={[{ label: "Suscripción", href: "/dashboard/suscripcion" }]} />
      <Pagina>
        <Pieza>
          <Suspense fallback={<VistaPago status="loading" message="" refPayco={null} detalle={null} />}>
            <ResponseContent />
          </Suspense>
        </Pieza>
      </Pagina>
    </div>
  );
}
