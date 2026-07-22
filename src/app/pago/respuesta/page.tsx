export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { CheckCircle2, Clock, XCircle } from "lucide-react";

// ePayco redirects the resident here with ?ref_payco=... after the checkout.
export default async function PagoRespuestaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const refRaw = sp.ref_payco ?? sp.x_ref_payco;
  const ref = Array.isArray(refRaw) ? refRaw[0] : refRaw;

  let status: "approved" | "pending" | "rejected" | "unknown" = "unknown";
  if (ref && /^[A-Za-z0-9-]{4,40}$/.test(ref) && process.env.DEMO_MODE !== "true") {
    try {
      const { verifyTransaction } = await import("@/lib/epayco");
      const v = await verifyTransaction(ref);
      if (v.success) {
        if (v.status === "approved") status = "approved";
        else if (v.status === "pending") status = "pending";
        else if (v.status === "rejected") status = "rejected";
      }
    } catch {
      /* show generic */
    }
  }

  const cfg = {
    approved: { icon: CheckCircle2, color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", title: "¡Pago aprobado!", msg: "Tu pago fue procesado correctamente. Tu estado de cuenta se actualizará en unos minutos." },
    pending: { icon: Clock, color: "#b45309", bg: "#fffbeb", border: "#fde68a", title: "Pago en proceso", msg: "Tu pago está siendo procesado. Te confirmaremos y tu saldo se actualizará una vez la entidad lo apruebe." },
    rejected: { icon: XCircle, color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", title: "Pago no aprobado", msg: "El pago no pudo completarse. No se realizó ningún cargo. Puedes intentarlo nuevamente desde tu portal." },
    unknown: { icon: Clock, color: "#4b5563", bg: "#f9fafb", border: "#e5e7eb", title: "Estamos confirmando tu pago", msg: "Recibimos tu transacción y la estamos verificando. Tu estado de cuenta se actualizará automáticamente al confirmarse." },
  }[status];
  const Icon = cfg.icon;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 440, width: "100%", background: "#fff", borderRadius: 18, padding: 40, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: cfg.bg, border: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <Icon style={{ width: 32, height: 32, color: cfg.color }} />
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: "#1f2937", margin: "0 0 8px" }}>{cfg.title}</h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>{cfg.msg}</p>
        {ref && (
          <p style={{ fontSize: 11.5, color: "#9ca3af", margin: "0 0 20px", fontFamily: "monospace" }}>
            Referencia: {ref}
          </p>
        )}
        <p style={{ fontSize: 12.5, color: "#9ca3af", margin: 0 }}>
          Puedes cerrar esta ventana y volver a tu portal cuando quieras.
        </p>
      </div>
    </div>
  );
}
