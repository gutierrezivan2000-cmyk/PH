export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { db } from "@/lib/db";
import Link from "next/link";
import { ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";

// ---- Constants ----
const PAGE_SIZE = 50;

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontSize: 10,
};

const ACTION_LABELS: Record<string, string> = {
  "user.role_change": "Cambió rol",
  "subscription.status_change": "Cambió estado de suscripción",
  "subscription.plan_change": "Cambió plan",
  "subscription.addons_change": "Actualizó add-ons",
  "subscription.notes_update": "Actualizó notas",
  "subscription.epayco_cancel": "Cancelación ePayco",
  "ticket.create": "Creó ticket",
  "ticket.update": "Actualizó ticket",
  "addon.toggle": "Activó/desactivó add-on",
};

const TARGET_TYPES = ["all", "user", "subscription", "ticket"] as const;

// ---- Data loading ----
async function loadAudit(params: {
  q: string;
  adminId: string;
  targetType: string;
  from: string;
  to: string;
  page: number;
}) {
  const { q, adminId, targetType, from, to, page } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (q) where.action = { contains: q, mode: "insensitive" };
  if (adminId) where.adminId = adminId;
  if (targetType !== "all") where.targetType = targetType;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  const [logs, total, admins] = await Promise.all([
    db.adminAuditLog.findMany({
      where,
      include: {
        admin: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    db.adminAuditLog.count({ where }),
    db.user.findMany({
      where: { role: "admin" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { logs, total, admins };
}

// ---- Helpers ----
function friendlyAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatMeta(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const entries = Object.entries(meta as Record<string, unknown>)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("  ");
  return entries.length > 90 ? entries.slice(0, 90) + "…" : entries;
}

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function buildUrl(
  current: Record<string, string>,
  overrides: Record<string, string>
): string {
  const p = { ...current, ...overrides };
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(p).filter(([, v]) => v !== ""))
  );
  const str = qs.toString();
  return `/admin/auditoria${str ? `?${str}` : ""}`;
}

// ---- Admin avatar ----
function AdminAvatar({
  name,
  email,
  image,
}: {
  name: string | null;
  email: string;
  image: string | null;
}) {
  const initials = (name || email).slice(0, 2).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(124,92,255,0.18)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          color: "#9a7fff",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--foreground)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 130,
          }}
        >
          {name || "—"}
        </p>
        <p
          style={{
            ...MONO,
            fontSize: 9,
            color: "rgba(255,255,255,0.35)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 130,
          }}
        >
          {email}
        </p>
      </div>
    </div>
  );
}

// ---- Filter bar (server HTML form using searchParams) ----
function FilterBar({
  current,
  admins,
}: {
  current: Record<string, string>;
  admins: { id: string; name: string | null; email: string }[];
}) {
  return (
    <form
      method="GET"
      action="/admin/auditoria"
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 20,
        alignItems: "center",
      }}
    >
      {/* Search */}
      <input
        name="q"
        defaultValue={current.q || ""}
        placeholder="Buscar por acción…"
        style={{
          flex: "1 1 220px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 13,
          color: "var(--foreground)",
          outline: "none",
        }}
      />

      {/* Admin select */}
      <select
        name="adminId"
        defaultValue={current.adminId || ""}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          outline: "none",
        }}
      >
        <option value="">Todos los admins</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name || a.email}
          </option>
        ))}
      </select>

      {/* Target type */}
      <select
        name="targetType"
        defaultValue={current.targetType || "all"}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          outline: "none",
        }}
      >
        {TARGET_TYPES.map((t) => (
          <option key={t} value={t}>
            {t === "all" ? "Todos los tipos" : t.charAt(0).toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>

      {/* Date from */}
      <input
        type="date"
        name="from"
        defaultValue={current.from || ""}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          outline: "none",
          colorScheme: "dark",
        }}
      />
      <input
        type="date"
        name="to"
        defaultValue={current.to || ""}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          color: "rgba(255,255,255,0.7)",
          outline: "none",
          colorScheme: "dark",
        }}
      />

      <button
        type="submit"
        style={{
          background: "rgba(124,92,255,0.15)",
          border: "1px solid rgba(124,92,255,0.35)",
          borderRadius: 10,
          padding: "8px 16px",
          fontSize: 12,
          color: "#9a7fff",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Filtrar
      </button>

      {Object.values(current).some(Boolean) && (
        <Link
          href="/admin/auditoria"
          style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.4)",
            textDecoration: "none",
            padding: "8px 10px",
          }}
        >
          Limpiar
        </Link>
      )}
    </form>
  );
}

// ---- Page ----
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  return (
    <AdminGate>
      <AuditoriaContent searchParams={searchParams} />
    </AdminGate>
  );
}

async function AuditoriaContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const current = {
    q: sp.q || "",
    adminId: sp.adminId || "",
    targetType: sp.targetType || "all",
    from: sp.from || "",
    to: sp.to || "",
    page: sp.page || "1",
  };

  const page = Math.max(1, parseInt(current.page, 10));
  const { logs, total, admins } = await loadAudit({
    q: current.q,
    adminId: current.adminId,
    targetType: current.targetType,
    from: current.from,
    to: current.to,
    page,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div style={{ padding: "24px 24px 80px", maxWidth: 1200 }}>
      <PageHeader
        section="06 · Auditoría"
        title="Registro de auditoría"
        description="Todas las acciones administrativas quedan registradas con admin, IP y contexto."
      />

      <FilterBar current={current} admins={admins} />

      {/* Table */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "180px 160px 120px 1fr 90px 70px",
            gap: 0,
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {["Admin", "Acción", "Target", "Detalles", "IP", "Cuando"].map((h) => (
            <p key={h} style={{ ...MONO, color: "rgba(255,255,255,0.4)" }}>
              {h}
            </p>
          ))}
        </div>

        {/* Rows */}
        {logs.length === 0 ? (
          <div style={{ padding: "56px 20px", textAlign: "center" }}>
            <ShieldCheck
              size={28}
              style={{ margin: "0 auto 12px", color: "rgba(255,255,255,0.2)" }}
            />
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>
              No hay entradas de auditoría para los filtros seleccionados.
            </p>
          </div>
        ) : (
          <div>
            {logs.map((log, idx) => {
              const meta = formatMeta(log.metadata);
              const targetLabel = log.targetType
                ? `${log.targetType} · ${log.targetId?.slice(0, 8) ?? "—"}`
                : "—";
              const when = timeAgo(log.createdAt);
              const full = new Date(log.createdAt).toLocaleString("es-CO", {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={log.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "180px 160px 120px 1fr 90px 70px",
                    alignItems: "center",
                    gap: 0,
                    padding: "12px 20px",
                    borderBottom:
                      idx < logs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : undefined,
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  {/* Admin */}
                  <AdminAvatar
                    name={log.admin.name}
                    email={log.admin.email}
                    image={log.admin.image}
                  />

                  {/* Action */}
                  <div>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--foreground)",
                        marginBottom: 2,
                      }}
                    >
                      {friendlyAction(log.action)}
                    </p>
                    <p
                      style={{
                        ...MONO,
                        fontSize: 9,
                        color: "rgba(255,255,255,0.3)",
                        fontWeight: 400,
                      }}
                    >
                      {log.action}
                    </p>
                  </div>

                  {/* Target */}
                  <p
                    style={{
                      ...MONO,
                      fontSize: 9,
                      color: "rgba(255,255,255,0.45)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={`${log.targetType ?? ""} ${log.targetId ?? ""}`}
                  >
                    {targetLabel}
                  </p>

                  {/* Metadata */}
                  <p
                    style={{
                      ...MONO,
                      fontSize: 9,
                      color: "rgba(255,255,255,0.35)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      paddingRight: 12,
                    }}
                    title={meta}
                  >
                    {meta || "—"}
                  </p>

                  {/* IP */}
                  <p
                    style={{
                      ...MONO,
                      fontSize: 9,
                      color: "rgba(255,255,255,0.3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={log.ipAddress || ""}
                  >
                    {log.ipAddress ? log.ipAddress.slice(0, 14) : "—"}
                  </p>

                  {/* Time */}
                  <p
                    style={{
                      ...MONO,
                      fontSize: 9,
                      color: "rgba(255,255,255,0.4)",
                      textAlign: "right",
                    }}
                    title={full}
                  >
                    {when}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 20,
            padding: "0 4px",
          }}
        >
          <p style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {hasPrev ? (
              <Link
                href={buildUrl(current, { page: String(page - 1) })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.65)",
                  textDecoration: "none",
                }}
              >
                <ChevronLeft size={13} />
                Anterior
              </Link>
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.2)",
                }}
              >
                <ChevronLeft size={13} />
                Anterior
              </span>
            )}
            <span
              style={{
                padding: "6px 14px",
                ...MONO,
                fontSize: 11,
                color: "rgba(255,255,255,0.5)",
                display: "flex",
                alignItems: "center",
              }}
            >
              {page} / {totalPages}
            </span>
            {hasNext ? (
              <Link
                href={buildUrl(current, { page: String(page + 1) })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.65)",
                  textDecoration: "none",
                }}
              >
                Siguiente
                <ChevronRight size={13} />
              </Link>
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "rgba(255,255,255,0.2)",
                }}
              >
                Siguiente
                <ChevronRight size={13} />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
