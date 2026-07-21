export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { fmtCOP, computeUnitSummary } from "@/lib/cartera";
import { PrintButton } from "./PrintButton";

function fecha(d: Date): string {
  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  consignacion: "Consignación",
  otro: "Otro",
};

interface Movement {
  date: Date;
  concept: string;
  charge: number | null;
  payment: number | null;
}

export default async function EstadoCuentaPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/cartera/${unitId}/estado`)}`);
  }

  // Demo mode never touches the DB (db is a stub there).
  if (process.env.DEMO_MODE === "true") notFound();

  const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
  await ensureAdminSchema();

  const unit = await db.unit.findFirst({
    where: { id: unitId, userId: session.user.id },
    include: {
      property: { select: { name: true, address: true, city: true } },
      charges: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { receivedAt: "asc" } },
    },
  });
  if (!unit) notFound();

  const admin = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, company: true, logoUrl: true, brandColor: true },
  });

  const accent =
    admin?.brandColor && /^#[0-9a-fA-F]{6}$/.test(admin.brandColor)
      ? admin.brandColor
      : "#7c3aed";
  const issuerName = admin?.company || admin?.name || "La Administración";

  const paymentsTotal = unit.payments.reduce((s, p) => s + p.amount, 0);
  const summary = computeUnitSummary(unit.charges, paymentsTotal, new Date());

  // Chronological movements with a running balance.
  const movements: Movement[] = [
    ...unit.charges.map((c) => ({
      date: c.dueDate,
      concept: c.concept,
      charge: c.amount,
      payment: null,
    })),
    ...unit.payments.map((p) => ({
      date: p.receivedAt,
      concept: `Pago ${METHOD_LABELS[p.method] || p.method}${p.reference ? ` · Ref ${p.reference}` : ""}`,
      charge: null,
      payment: p.amount,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const rows = movements.map((m) => {
    running += (m.charge || 0) - (m.payment || 0);
    return { ...m, balance: running };
  });

  const owes = summary.balance > 0;

  return (
    <div style={{ background: "#e5e7eb", minHeight: "100vh", padding: "24px 12px" }}>
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .cert-sheet { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          @page { margin: 16mm; }
        }
      `}</style>

      <PrintButton />

      <div
        className="cert-sheet"
        style={{
          maxWidth: 760,
          margin: "0 auto",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
          padding: "48px 52px",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: "#1f2937",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            background: accent,
            borderRadius: "12px 12px 0 0",
          }}
        />

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, gap: 16 }}>
          <div>
            {admin?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={admin.logoUrl}
                alt={issuerName}
                style={{ maxHeight: 48, maxWidth: 200, display: "block", marginBottom: 8 }}
              />
            ) : (
              <p style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>{issuerName}</p>
            )}
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              Administración · {unit.property.name}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontSize: 16, fontWeight: 800, margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Estado de Cuenta
            </p>
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
              Generado el {fecha(new Date())}
            </p>
          </div>
        </div>

        {/* Unit info + balance */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <div
            style={{
              flex: "1 1 220px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "14px 18px",
            }}
          >
            <p style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
              Unidad
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{unit.label}</p>
            {unit.residentName && (
              <p style={{ fontSize: 13, color: "#374151", margin: "2px 0 0" }}>{unit.residentName}</p>
            )}
            {unit.monthlyFee ? (
              <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>
                Cuota mensual: {fmtCOP(unit.monthlyFee)}
                {unit.coeficiente ? ` · Coef. ${unit.coeficiente}%` : ""}
              </p>
            ) : null}
          </div>
          <div
            style={{
              flex: "1 1 220px",
              borderRadius: 10,
              padding: "14px 18px",
              background: owes ? "#fef2f2" : "#f0fdf4",
              border: `1px solid ${owes ? "#fecaca" : "#bbf7d0"}`,
            }}
          >
            <p style={{ fontSize: 11, color: owes ? "#b91c1c" : "#15803d", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
              {owes ? "Saldo pendiente" : summary.balance < 0 ? "Saldo a favor" : "Estado"}
            </p>
            <p style={{ fontSize: 22, fontWeight: 800, margin: 0, color: owes ? "#b91c1c" : "#15803d" }}>
              {summary.balance === 0 ? "AL DÍA" : fmtCOP(Math.abs(summary.balance))}
            </p>
            {summary.overdueAmount > 0 && (
              <p style={{ fontSize: 12, color: "#b91c1c", margin: "4px 0 0" }}>
                En mora: {fmtCOP(summary.overdueAmount)} · {summary.overdueDays} días
              </p>
            )}
          </div>
        </div>

        {/* Movements table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              {["Fecha", "Concepto", "Cargo", "Pago", "Saldo"].map((h, i) => (
                <th
                  key={h}
                  style={{
                    textAlign: i >= 2 ? "right" : "left",
                    padding: "8px 10px",
                    borderBottom: "2px solid #e5e7eb",
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#4b5563",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "20px 10px", textAlign: "center", color: "#9ca3af" }}>
                  Sin movimientos registrados.
                </td>
              </tr>
            ) : (
              rows.map((m, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "7px 10px", whiteSpace: "nowrap", color: "#6b7280" }}>
                    {fecha(new Date(m.date))}
                  </td>
                  <td style={{ padding: "7px 10px" }}>{m.concept}</td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#b91c1c" }}>
                    {m.charge ? fmtCOP(m.charge) : ""}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", color: "#15803d" }}>
                    {m.payment ? fmtCOP(m.payment) : ""}
                  </td>
                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: m.balance > 0 ? "#b91c1c" : "#15803d" }}>
                    {fmtCOP(m.balance)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p style={{ fontSize: 10.5, color: "#9ca3af", margin: "24px 0 0", lineHeight: 1.6 }}>
          Documento informativo generado con SOPH.IA a la fecha indicada. Los pagos registrados
          después de esa fecha no aparecen reflejados. Para aclaraciones, comuníquese con la
          administración de {unit.property.name}.
        </p>
      </div>

      <PrintButton />
    </div>
  );
}
