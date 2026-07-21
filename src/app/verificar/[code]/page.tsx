export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { db } from "@/lib/db";
import { CheckCircle2, XCircle, ShieldQuestion } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  paz_y_salvo: "Paz y Salvo",
  residencia: "Certificado de Residencia",
};

function fecha(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

/** Mask a document number: keep last 3 chars. */
function maskDoc(doc: string): string {
  if (doc.length <= 3) return doc;
  return "•".repeat(Math.max(3, doc.length - 3)) + doc.slice(-3);
}

interface Meta {
  recipientDocument?: string;
  validUntil?: string;
}

export default async function VerificarPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  let cert: {
    type: string;
    recipientName: string;
    unitLabel: string;
    status: string;
    createdAt: Date;
    revokedAt: Date | null;
    meta: unknown;
    property: { name: string; city: string | null };
  } | null = null;

  // Only well-formed codes hit the DB (defensive against scanning noise).
  // Demo mode never touches the DB (db is a stub there) → "no encontrado".
  if (process.env.DEMO_MODE !== "true" && /^[A-Za-z0-9_-]{8,40}$/.test(code)) {
    try {
      const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
      await ensureAdminSchema();
      cert = await db.certificate.findUnique({
        where: { verifyCode: code },
        select: {
          type: true,
          recipientName: true,
          unitLabel: true,
          status: true,
          createdAt: true,
          revokedAt: true,
          meta: true,
          property: { select: { name: true, city: true } },
        },
      });
    } catch (e) {
      console.error("[verificar]", e);
    }
  }

  const meta = (cert?.meta as Meta | null) || {};
  const isValid = cert?.status === "valid";

  // A paz y salvo past its "hasta" date is authentic but no longer in force —
  // never show it as "vigente" to a third party scanning the QR.
  const todayBogota = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
  }).format(new Date()); // "YYYY-MM-DD" — lexical compare is safe for ISO dates
  const isExpired =
    isValid &&
    cert?.type === "paz_y_salvo" &&
    typeof meta.validUntil === "string" &&
    meta.validUntil < todayBogota;

  const mono: React.CSSProperties = {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 10,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: "#0a0a0a" }}
    >
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center text-lg font-bold text-white mb-3"
            style={{
              background: "linear-gradient(135deg, #7c5cff, #5a3cf0)",
              boxShadow: "0 0 32px rgba(124,92,255,0.35)",
            }}
          >
            S
          </div>
          <p style={{ ...mono, color: "rgba(255,255,255,0.45)" }}>
            SOPH.IA · Verificación de documentos
          </p>
        </div>

        <div
          className="rounded-2xl border p-7"
          style={{
            background: "#15151a",
            borderColor: !cert
              ? "rgba(255,185,88,0.30)"
              : isExpired
                ? "rgba(255,185,88,0.30)"
                : isValid
                  ? "rgba(76,214,160,0.30)"
                  : "rgba(255,111,111,0.30)",
          }}
        >
          {!cert ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <ShieldQuestion className="h-8 w-8 flex-shrink-0" style={{ color: "#ffb958" }} />
                <div>
                  <p className="text-[16px] font-semibold" style={{ color: "#ffb958" }}>
                    Documento no encontrado
                  </p>
                  <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                    Código: <span style={{ fontFamily: "monospace" }}>{code.slice(0, 40)}</span>
                  </p>
                </div>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.60)" }}>
                No existe ningún certificado con este código. El documento que lo cita
                <strong> no debe considerarse auténtico</strong>. Verifique que la URL o el
                código QR correspondan exactamente al documento recibido.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                {isExpired ? (
                  <ShieldQuestion className="h-8 w-8 flex-shrink-0" style={{ color: "#ffb958" }} />
                ) : isValid ? (
                  <CheckCircle2 className="h-8 w-8 flex-shrink-0" style={{ color: "#4cd6a0" }} />
                ) : (
                  <XCircle className="h-8 w-8 flex-shrink-0" style={{ color: "#ff6f6f" }} />
                )}
                <div>
                  <p
                    className="text-[16px] font-semibold"
                    style={{ color: isExpired ? "#ffb958" : isValid ? "#4cd6a0" : "#ff6f6f" }}
                  >
                    {isExpired
                      ? "Documento auténtico · vigencia vencida"
                      : isValid
                        ? "Documento auténtico y vigente"
                        : "Documento REVOCADO"}
                  </p>
                  <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
                    {TYPE_LABELS[cert.type] || "Certificado"}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { label: "Copropiedad", value: cert.property.name + (cert.property.city ? ` · ${cert.property.city}` : "") },
                  { label: "Unidad", value: cert.unitLabel },
                  { label: "Titular", value: cert.recipientName },
                  ...(meta.recipientDocument
                    ? [{ label: "Documento", value: maskDoc(meta.recipientDocument) }]
                    : []),
                  { label: "Expedido", value: fecha(cert.createdAt) },
                  ...(meta.validUntil && cert.type === "paz_y_salvo"
                    ? [{ label: "Paz y salvo hasta", value: fecha(new Date(`${meta.validUntil}T12:00:00`)) }]
                    : []),
                  ...(!isValid && cert.revokedAt
                    ? [{ label: "Revocado el", value: fecha(cert.revokedAt) }]
                    : []),
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4 pb-2.5"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <span style={{ ...mono, color: "rgba(255,255,255,0.40)" }} className="mt-0.5">
                      {row.label}
                    </span>
                    <span className="text-[13.5px] text-right" style={{ color: "#f6f5f7" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] leading-relaxed mt-5" style={{ color: "rgba(255,255,255,0.35)" }}>
                {isExpired
                  ? "Este certificado es auténtico pero su periodo de validez ya venció. Solicite a la administración un paz y salvo actualizado."
                  : isValid
                    ? "Este certificado fue expedido digitalmente por la administración de la copropiedad a través de SOPH.IA. Compare los datos anteriores con el documento físico o PDF recibido."
                    : "Este certificado fue revocado por la administración y ya no es válido, aunque el documento físico o PDF siga circulando."}
              </p>
            </>
          )}
        </div>

        <p className="text-center mt-6" style={{ ...mono, color: "rgba(255,255,255,0.25)" }}>
          sophia · gestión inteligente de propiedad horizontal
        </p>
      </div>
    </div>
  );
}
