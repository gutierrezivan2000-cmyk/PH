export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { db } from "@/lib/db";
import { fmtCOP, computeUnitSummary } from "@/lib/cartera";
import { Home, FileText, Megaphone, Wallet, CheckCircle2, AlertCircle } from "lucide-react";

const DOC_LABELS: Record<string, string> = {
  reglamento_interno: "Reglamento interno",
  manual_convivencia: "Manual de convivencia",
  otro: "Documento",
};

function fecha(d: Date | string): string {
  return new Date(d).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

interface Movement {
  date: Date;
  concept: string;
  charge: number | null;
  payment: number | null;
}

function NotFound() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 400, textAlign: "center", background: "#fff", borderRadius: 16, padding: 40, boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <AlertCircle style={{ width: 40, height: 40, color: "#f59e0b", margin: "0 auto 12px" }} />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1f2937", margin: "0 0 8px" }}>Enlace no válido</h1>
        <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
          Este enlace no corresponde a ninguna unidad, o fue actualizado por la administración.
          Solicita el enlace vigente a la administración de tu copropiedad.
        </p>
      </div>
    </div>
  );
}

export default async function ResidentPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (process.env.DEMO_MODE === "true") return <NotFound />;
  if (!/^[A-Za-z0-9_-]{16,48}$/.test(token)) return <NotFound />;

  try {
    const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
    await ensureAdminSchema();
  } catch {
    /* best effort */
  }

  const unit = await db.unit
    .findUnique({
      where: { portalToken: token },
      include: {
        property: {
          select: {
            name: true,
            city: true,
            userId: true,
          },
        },
        charges: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
        payments: { orderBy: { receivedAt: "asc" } },
      },
    })
    .catch(() => null);

  if (!unit) return <NotFound />;

  const [admin, announcements, documents] = await Promise.all([
    db.user.findUnique({
      where: { id: unit.property.userId },
      select: { name: true, company: true, logoUrl: true, brandColor: true },
    }),
    db.announcement.findMany({
      where: { propertyId: unit.propertyId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, subject: true, content: true, sentAt: true, createdAt: true },
    }),
    db.propertyDocument.findMany({
      where: { propertyId: unit.propertyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, name: true, url: true },
    }),
  ]);

  const accent =
    admin?.brandColor && /^#[0-9a-fA-F]{6}$/.test(admin.brandColor) ? admin.brandColor : "#7c3aed";
  const issuer = admin?.company || admin?.name || "Administración";

  const paymentsTotal = unit.payments.reduce((s, p) => s + p.amount, 0);
  const summary = computeUnitSummary(unit.charges, paymentsTotal, new Date());
  const owes = summary.balance > 0;

  const movements: Movement[] = [
    ...unit.charges.map((c) => ({ date: c.dueDate, concept: c.concept, charge: c.amount, payment: null })),
    ...unit.payments.map((p) => ({ date: p.receivedAt, concept: "Pago recibido", charge: null, payment: p.amount })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 12);

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    border: "1px solid #ececef",
    overflow: "hidden",
  };
  const sectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#6b7280",
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 0 12px",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f5", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", color: "#1f2937" }}>
      {/* Header */}
      <div style={{ background: accent, padding: "28px 20px 24px", color: "#fff" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {admin?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={admin.logoUrl} alt={issuer} style={{ maxHeight: 40, maxWidth: 180, marginBottom: 12 }} />
          ) : (
            <p style={{ fontSize: 16, fontWeight: 800, margin: "0 0 4px" }}>{issuer}</p>
          )}
          <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>
            {unit.property.name}
            {unit.property.city ? ` · ${unit.property.city}` : ""}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Home style={{ width: 20, height: 20 }} />
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{unit.label}</p>
              {unit.residentName && <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>{unit.residentName}</p>}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Estado de cuenta */}
        <div style={cardStyle}>
          <div style={{ padding: "18px 20px", background: owes ? "#fef2f2" : "#f0fdf4", borderBottom: "1px solid #ececef" }}>
            <p style={{ ...sectionTitle, margin: "0 0 6px", color: owes ? "#b91c1c" : "#15803d" }}>
              <Wallet style={{ width: 14, height: 14 }} />
              Estado de cuenta
            </p>
            <p style={{ fontSize: 28, fontWeight: 800, margin: 0, color: owes ? "#b91c1c" : "#15803d" }}>
              {summary.balance === 0 ? "Al día" : summary.balance < 0 ? `${fmtCOP(-summary.balance)} a favor` : fmtCOP(summary.balance)}
            </p>
            {owes ? (
              <p style={{ fontSize: 13, color: "#b91c1c", margin: "4px 0 0" }}>
                Saldo pendiente
                {summary.overdueAmount > 0 ? ` · ${fmtCOP(summary.overdueAmount)} en mora (${summary.overdueDays} días)` : ""}
              </p>
            ) : (
              <p style={{ fontSize: 13, color: "#15803d", margin: "4px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCircle2 style={{ width: 14, height: 14 }} /> No tienes saldos pendientes
              </p>
            )}
          </div>
          {movements.length > 0 && (
            <div>
              {movements.map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px", borderBottom: i < movements.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 54, fontVariantNumeric: "tabular-nums" }}>{fecha(m.date)}</span>
                  <span style={{ flex: 1, fontSize: 13.5 }}>{m.concept}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", color: m.payment ? "#15803d" : "#b45309" }}>
                    {m.payment ? `− ${fmtCOP(m.payment)}` : `+ ${fmtCOP(m.charge || 0)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comunicados */}
        {announcements.length > 0 && (
          <div>
            <p style={sectionTitle}>
              <Megaphone style={{ width: 14, height: 14 }} />
              Comunicados
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {announcements.map((a) => (
                <div key={a.id} style={{ ...cardStyle, padding: "14px 18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{a.subject}</p>
                    <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{fecha(a.sentAt || a.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6, margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{a.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documentos */}
        {documents.length > 0 && (
          <div>
            <p style={sectionTitle}>
              <FileText style={{ width: 14, height: 14 }} />
              Documentos
            </p>
            <div style={cardStyle}>
              {documents.map((d, i) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: i < documents.length - 1 ? "1px solid #f3f4f6" : "none", textDecoration: "none", color: "#1f2937" }}
                >
                  <FileText style={{ width: 16, height: 16, color: accent, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>{d.name}</p>
                    <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>{DOC_LABELS[d.type] || "Documento"}</p>
                  </div>
                  <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>Abrir</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p style={{ fontSize: 11, color: "#9ca3af", textAlign: "center", margin: "8px 0 0", lineHeight: 1.6 }}>
          Portal de {unit.property.name} · administrado por {issuer}.<br />
          Este enlace es personal de tu unidad — no lo compartas. Información al día de hoy.
        </p>
        <p style={{ fontSize: 10, color: "#c4c4c8", textAlign: "center", margin: 0, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Con tecnología SOPH.IA
        </p>
      </div>
    </div>
  );
}
