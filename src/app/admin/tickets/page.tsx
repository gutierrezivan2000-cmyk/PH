import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare, Clock, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  pending: "Pendiente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "baja",
  normal: "normal",
  high: "alta",
  urgent: "urgente",
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  billing: "Facturación",
  technical: "Técnico",
  feature: "Función",
  bug: "Bug",
};

function priorityStyle(priority: string): React.CSSProperties {
  switch (priority) {
    case "urgent":
      return {
        background: "rgba(255,111,111,0.12)",
        color: "#ff8585",
        border: "1px solid rgba(255,111,111,0.25)",
      };
    case "high":
      return {
        background: "rgba(255,185,88,0.12)",
        color: "#ffb958",
        border: "1px solid rgba(255,185,88,0.25)",
      };
    case "normal":
      return {
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.50)",
        border: "1px solid rgba(255,255,255,0.10)",
      };
    default: // low
      return {
        background: "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.30)",
        border: "1px solid rgba(255,255,255,0.07)",
      };
  }
}

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case "open":
      return {
        background: "rgba(255,111,111,0.10)",
        color: "#ff8585",
        border: "1px solid rgba(255,111,111,0.25)",
      };
    case "pending":
      return {
        background: "rgba(255,185,88,0.10)",
        color: "#ffb958",
        border: "1px solid rgba(255,185,88,0.25)",
      };
    case "resolved":
      return {
        background: "rgba(76,214,160,0.10)",
        color: "#4cd6a0",
        border: "1px solid rgba(76,214,160,0.25)",
      };
    default: // closed
      return {
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.40)",
        border: "1px solid rgba(255,255,255,0.10)",
      };
  }
}

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

const monoSmall: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

interface SearchParams {
  status?: string;
  priority?: string;
  category?: string;
  assigned?: string;
  q?: string;
}

async function TicketsContent({ searchParams }: { searchParams: SearchParams }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  const activeStatus = searchParams.status;
  const activePriority = searchParams.priority;
  const activeCategory = searchParams.category;
  const activeAssigned = searchParams.assigned;
  const q = searchParams.q;

  // Build where clause
  const where: Record<string, unknown> = {};
  if (activeStatus && activeStatus !== "all") where.status = activeStatus;
  if (activePriority && activePriority !== "all") where.priority = activePriority;
  if (activeCategory && activeCategory !== "all") where.category = activeCategory;
  if (activeAssigned === "unassigned") {
    where.assignedTo = null;
  } else if (activeAssigned === "mine") {
    where.assignedTo = admin.userId;
  }
  if (q) {
    where.OR = [{ subject: { contains: q, mode: "insensitive" } }];
  }

  const tickets = await db.ticket.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
      _count: { select: { messages: true } },
      messages: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Count per status tab (always without status filter)
  const [allCount, openCount, pendingCount, resolvedCount, closedCount] =
    await Promise.all([
      db.ticket.count({}),
      db.ticket.count({ where: { status: "open" } }),
      db.ticket.count({ where: { status: "pending" } }),
      db.ticket.count({ where: { status: "resolved" } }),
      db.ticket.count({ where: { status: "closed" } }),
    ]);

  const counts: Record<string, number> = {
    all: allCount,
    open: openCount,
    pending: pendingCount,
    resolved: resolvedCount,
    closed: closedCount,
  };

  const tabs = [
    { key: "all", label: "Todos" },
    { key: "open", label: "Abiertos" },
    { key: "pending", label: "Pendientes" },
    { key: "resolved", label: "Resueltos" },
    { key: "closed", label: "Cerrados" },
  ];

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = {
      status: activeStatus,
      priority: activePriority,
      category: activeCategory,
      assigned: activeAssigned,
      q,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all") p.set(k, v);
    }
    const s = p.toString();
    return `/admin/tickets${s ? `?${s}` : ""}`;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader section="03 · Tickets" title="Cola de soporte" />

      {/* ── Filter strip ──────────────────────────────────────── */}
      <div className="mb-6 space-y-3">
        {/* Status tabs */}
        <div
          className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        >
          {tabs.map((tab) => {
            const isActive = (activeStatus || "all") === tab.key;
            return (
              <Link
                key={tab.key}
                href={buildUrl({ status: tab.key === "all" ? undefined : tab.key })}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all flex-shrink-0"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  background: isActive ? "rgba(124,92,255,0.12)" : "transparent",
                  color: isActive ? "#9a7fff" : "rgba(255,255,255,0.45)",
                  borderBottom: isActive ? "1px solid rgba(124,92,255,0.50)" : "1px solid transparent",
                }}
              >
                {tab.label}
                <span
                  className="px-1.5 py-0.5 rounded-md text-[10px]"
                  style={{
                    background: isActive ? "rgba(124,92,255,0.20)" : "rgba(255,255,255,0.07)",
                    color: isActive ? "#9a7fff" : "rgba(255,255,255,0.35)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {counts[tab.key]}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Filter selects + search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority */}
          <select
            defaultValue={activePriority || "all"}
            onChange={(e) => {
              const url = buildUrl({ priority: e.target.value === "all" ? undefined : e.target.value });
              window.location.href = url;
            }}
            className="h-8 px-3 rounded-lg text-[11px] cursor-pointer transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "rgba(255,255,255,0.55)",
              outline: "none",
            }}
          >
            <option value="all">Prioridad: Todas</option>
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>

          {/* Category */}
          <select
            defaultValue={activeCategory || "all"}
            onChange={(e) => {
              const url = buildUrl({ category: e.target.value === "all" ? undefined : e.target.value });
              window.location.href = url;
            }}
            className="h-8 px-3 rounded-lg text-[11px] cursor-pointer transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "rgba(255,255,255,0.55)",
              outline: "none",
            }}
          >
            <option value="all">Categoría: Todas</option>
            <option value="general">General</option>
            <option value="billing">Facturación</option>
            <option value="technical">Técnico</option>
            <option value="feature">Función</option>
            <option value="bug">Bug</option>
          </select>

          {/* Assigned */}
          <select
            defaultValue={activeAssigned || "all"}
            onChange={(e) => {
              const url = buildUrl({ assigned: e.target.value === "all" ? undefined : e.target.value });
              window.location.href = url;
            }}
            className="h-8 px-3 rounded-lg text-[11px] cursor-pointer transition-colors"
            style={{
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              background: "var(--card)",
              border: "1px solid var(--border)",
              color: "rgba(255,255,255,0.55)",
              outline: "none",
            }}
          >
            <option value="all">Asignado: Todos</option>
            <option value="unassigned">Sin asignar</option>
            <option value="mine">Míos</option>
          </select>

          {/* Search */}
          <form method="GET" action="/admin/tickets" className="flex-1 min-w-[180px]">
            {activeStatus && <input type="hidden" name="status" value={activeStatus} />}
            {activePriority && <input type="hidden" name="priority" value={activePriority} />}
            {activeCategory && <input type="hidden" name="category" value={activeCategory} />}
            {activeAssigned && <input type="hidden" name="assigned" value={activeAssigned} />}
            <input
              name="q"
              defaultValue={q || ""}
              placeholder="Buscar por asunto..."
              className="h-8 w-full px-3 rounded-lg text-[12px] placeholder:text-muted-foreground/40 focus:outline-none transition-colors"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}
            />
          </form>
        </div>
      </div>

      {/* ── Ticket list ───────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid var(--border)", background: "var(--card)" }}
      >
        {tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <MessageSquare className="h-8 w-8" style={{ color: "rgba(255,255,255,0.15)" }} />
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
              No hay tickets que coincidan con los filtros.
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {tickets.map((ticket) => {
              const lastMsg = ticket.messages[0];
              const preview = lastMsg?.content
                ? lastMsg.content.replace(/\n/g, " ").slice(0, 100)
                : null;

              return (
                <Link
                  key={ticket.id}
                  href={`/admin/tickets/${ticket.id}`}
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-white/[0.025] transition-colors"
                >
                  {/* Priority badge */}
                  <span
                    className="flex-shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium"
                    style={{ ...monoSmall, ...priorityStyle(ticket.priority) }}
                  >
                    {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                  </span>

                  {/* Subject + preview */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-foreground truncate">
                      {ticket.subject}
                    </p>
                    {preview && (
                      <p
                        className="text-[12px] truncate mt-0.5"
                        style={{ color: "rgba(255,255,255,0.40)" }}
                      >
                        {preview}
                      </p>
                    )}
                    <p
                      className="text-[11px] mt-1 truncate"
                      style={{ ...monoSmall, color: "rgba(255,255,255,0.30)", textTransform: "none" }}
                    >
                      {ticket.user.name || "—"} · {ticket.user.email}
                    </p>
                  </div>

                  {/* Right side meta */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Status */}
                    <span
                      className="px-2 py-1 rounded-lg text-[10px] font-medium"
                      style={{ ...monoSmall, ...statusStyle(ticket.status) }}
                    >
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>

                    {/* Category */}
                    <span
                      className="px-2 py-1 rounded-lg text-[10px] hidden sm:inline-block"
                      style={{
                        ...monoSmall,
                        background: "rgba(255,255,255,0.04)",
                        color: "rgba(255,255,255,0.35)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                    </span>

                    {/* Message count */}
                    <span
                      className="flex items-center gap-1 text-[11px] hidden md:flex"
                      style={{ ...monoSmall, color: "rgba(255,255,255,0.30)", textTransform: "none" }}
                    >
                      <MessageSquare className="h-3 w-3" />
                      {ticket._count.messages}
                    </span>

                    {/* Last activity */}
                    <span
                      className="flex items-center gap-1 text-[11px] hidden lg:flex"
                      style={{ ...monoSmall, color: "rgba(255,255,255,0.25)", textTransform: "none" }}
                    >
                      <Clock className="h-3 w-3" />
                      {relativeTime(ticket.updatedAt)}
                    </span>

                    <ChevronRight
                      className="h-4 w-4 opacity-0 group-hover:opacity-60 transition-opacity"
                      style={{ color: "rgba(255,255,255,0.40)" }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  return (
    <AdminGate>
      <TicketsContent searchParams={sp} />
    </AdminGate>
  );
}
