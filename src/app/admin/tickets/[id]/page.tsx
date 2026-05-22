import { AdminGate } from "@/components/admin/AdminGate";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  User,
  ArrowLeft,
  Paperclip,
  Calendar,
  Tag,
  Shield,
  ExternalLink,
} from "lucide-react";
import { AdminTicketActions } from "@/components/admin/tickets/AdminTicketActions";
import { AdminTicketReplyBox } from "@/components/admin/tickets/AdminTicketReplyBox";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  pending: "Pendiente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
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
      return { background: "rgba(255,111,111,0.12)", color: "#ff8585", border: "1px solid rgba(255,111,111,0.25)" };
    case "high":
      return { background: "rgba(255,185,88,0.12)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.25)" };
    case "normal":
      return { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.50)", border: "1px solid rgba(255,255,255,0.10)" };
    default:
      return { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.30)", border: "1px solid rgba(255,255,255,0.07)" };
  }
}

function statusStyle(status: string): React.CSSProperties {
  switch (status) {
    case "open":
      return { background: "rgba(255,111,111,0.10)", color: "#ff8585", border: "1px solid rgba(255,111,111,0.25)" };
    case "pending":
      return { background: "rgba(255,185,88,0.10)", color: "#ffb958", border: "1px solid rgba(255,185,88,0.25)" };
    case "resolved":
      return { background: "rgba(76,214,160,0.10)", color: "#4cd6a0", border: "1px solid rgba(76,214,160,0.25)" };
    default:
      return { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.40)", border: "1px solid rgba(255,255,255,0.10)" };
  }
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const monoSmall: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

async function TicketDetailContent({ id }: { id: string }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          subscription: { select: { id: true, status: true, planId: true } },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
      _count: { select: { messages: true } },
    },
  });

  if (!ticket) notFound();

  const recentTickets = await db.ticket.findMany({
    where: { userId: ticket.userId, id: { not: id } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, subject: true, status: true, priority: true, createdAt: true },
  });

  // Get assigned admin name if assigned
  let assignedName: string | null = null;
  if (ticket.assignedTo) {
    const assignedUser = await db.user.findUnique({
      where: { id: ticket.assignedTo },
      select: { name: true, email: true },
    });
    assignedName = assignedUser?.name || assignedUser?.email || ticket.assignedTo;
  }

  type Attachment = { name: string; url: string; size: number };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      {/* ── Back link ─────────────────────────────────────────── */}
      <Link
        href="/admin/tickets"
        className="inline-flex items-center gap-2 text-[12px] mb-6 transition-colors hover:text-foreground"
        style={{ ...monoSmall, textTransform: "none", color: "rgba(255,255,255,0.40)" }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a tickets
      </Link>

      {/* ── Ticket header ─────────────────────────────────────── */}
      <div
        className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 p-5 rounded-2xl"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
              style={{ ...monoSmall, ...statusStyle(ticket.status) }}
            >
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </span>
            <span
              className="px-2.5 py-1 rounded-lg text-[10px] font-medium"
              style={{ ...monoSmall, ...priorityStyle(ticket.priority) }}
            >
              {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
            </span>
            {ticket.assignedTo ? (
              <span
                className="px-2.5 py-1 rounded-lg text-[10px]"
                style={{
                  ...monoSmall,
                  background: "rgba(124,92,255,0.10)",
                  color: "#9a7fff",
                  border: "1px solid rgba(124,92,255,0.25)",
                }}
              >
                Asignado a: {assignedName}
              </span>
            ) : (
              <form action={`/api/admin/tickets/${id}`} method="PATCH" className="inline">
                <span
                  className="text-[11px] cursor-pointer px-2.5 py-1 rounded-lg transition-colors"
                  style={{
                    ...monoSmall,
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.35)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  Sin asignar
                </span>
              </form>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            {ticket.subject}
          </h1>
          <p className="text-[11px] mt-1" style={{ ...monoSmall, color: "rgba(255,255,255,0.30)", textTransform: "none" }}>
            #{ticket.id.slice(-8)} · {ticket._count.messages} mensajes · Creado {formatDate(ticket.createdAt)}
          </p>
        </div>

        {/* Action controls (client component) */}
        <AdminTicketActions
          ticketId={id}
          currentStatus={ticket.status}
          currentPriority={ticket.priority}
          currentCategory={ticket.category}
          adminId={admin.userId}
          isAssigned={!!ticket.assignedTo}
          isAssignedToMe={ticket.assignedTo === admin.userId}
        />
      </div>

      {/* ── Main layout ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Conversation (left 2/3) ───────────────────────── */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Messages */}
          <div className="space-y-3">
            {ticket.messages.map((msg) => {
              const isInternal = msg.internal;
              const isAdmin = msg.fromAdmin;
              const attachments = (msg.attachments as Attachment[] | null) ?? [];

              let cardStyle: React.CSSProperties;
              if (isInternal) {
                cardStyle = {
                  background: "rgba(255,185,88,0.06)",
                  border: "1px solid rgba(255,185,88,0.20)",
                  borderRadius: "1rem",
                  padding: "16px",
                };
              } else if (isAdmin) {
                cardStyle = {
                  background: "rgba(124,92,255,0.08)",
                  border: "1px solid rgba(124,92,255,0.20)",
                  borderRadius: "1rem",
                  padding: "16px",
                };
              } else {
                cardStyle = {
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "1rem",
                  padding: "16px",
                };
              }

              return (
                <div key={msg.id} style={cardStyle}>
                  {/* Message header */}
                  <div className="flex items-center gap-2 mb-3">
                    {isInternal ? (
                      <span
                        className="px-2 py-0.5 rounded text-[9px] font-bold"
                        style={{ ...monoSmall, background: "rgba(255,185,88,0.15)", color: "#ffb958" }}
                      >
                        Nota Interna
                      </span>
                    ) : null}
                    {isAdmin ? (
                      <>
                        <div
                          className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: "rgba(124,92,255,0.15)" }}
                        >
                          <Shield className="h-3.5 w-3.5" style={{ color: "#9a7fff" }} />
                        </div>
                        <div>
                          <span className="text-[13px] font-medium" style={{ color: "#9a7fff" }}>
                            Admin
                          </span>
                          <span
                            className="ml-1.5 px-1.5 py-0.5 rounded text-[9px]"
                            style={{
                              ...monoSmall,
                              background: "rgba(124,92,255,0.12)",
                              color: "#9a7fff",
                            }}
                          >
                            ADMIN
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        {ticket.user.image ? (
                          <img
                            src={ticket.user.image}
                            alt=""
                            className="h-7 w-7 rounded-lg flex-shrink-0"
                            style={{ border: "1px solid var(--border)" }}
                          />
                        ) : (
                          <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(255,255,255,0.07)" }}
                          >
                            <User className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.40)" }} />
                          </div>
                        )}
                        <div>
                          <span className="text-[13px] font-medium text-foreground">
                            {ticket.user.name || ticket.user.email}
                          </span>
                          <span
                            className="ml-1.5 text-[11px]"
                            style={{ ...monoSmall, color: "rgba(255,255,255,0.30)", textTransform: "none" }}
                          >
                            {ticket.user.email}
                          </span>
                        </div>
                      </>
                    )}

                    <span
                      className="ml-auto text-[11px]"
                      style={{ ...monoSmall, color: "rgba(255,255,255,0.25)", textTransform: "none" }}
                    >
                      {formatDate(msg.createdAt)}
                    </span>
                  </div>

                  {/* Content */}
                  <p
                    className="text-[13.5px] leading-relaxed whitespace-pre-wrap"
                    style={{ color: isAdmin ? "rgba(255,255,255,0.85)" : "var(--foreground)" }}
                  >
                    {msg.content}
                  </p>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {attachments.map((att, i) => (
                        <a
                          key={i}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.10)",
                          }}
                        >
                          <Paperclip className="h-3 w-3" style={{ color: "rgba(255,255,255,0.40)" }} />
                          <span className="text-[11px]" style={{ ...monoSmall, color: "rgba(255,255,255,0.55)", textTransform: "none" }}>
                            {att.name}
                          </span>
                          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-mono)" }}>
                            {att.size ? `${Math.round(att.size / 1024)}KB` : ""}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reply composer (client) */}
          <AdminTicketReplyBox ticketId={id} adminId={admin.userId} ticketStatus={ticket.status} />
        </div>

        {/* ── Sidebar (right 1/3) ───────────────────────────── */}
        <div className="flex flex-col gap-4">
          {/* User card */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[10px] uppercase mb-4" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)" }}>
              Usuario
            </p>
            <div className="flex items-center gap-3 mb-4">
              {ticket.user.image ? (
                <img
                  src={ticket.user.image}
                  alt=""
                  className="h-10 w-10 rounded-xl flex-shrink-0"
                  style={{ border: "1px solid var(--border)" }}
                />
              ) : (
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)" }}
                >
                  <User className="h-4.5 w-4.5" style={{ color: "rgba(255,255,255,0.35)" }} />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">
                  {ticket.user.name || "—"}
                </p>
                <p className="text-[11px] truncate" style={{ fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.40)" }}>
                  {ticket.user.email}
                </p>
              </div>
            </div>
            <Link
              href={`/admin/usuarios/${ticket.user.id}`}
              className="flex items-center gap-1.5 text-[11px] transition-colors hover:text-[#9a7fff]"
              style={{ ...monoSmall, color: "rgba(255,255,255,0.35)", textTransform: "none" }}
            >
              <ExternalLink className="h-3 w-3" />
              Ver perfil de usuario
            </Link>

            {/* Subscription chip */}
            {ticket.user.subscription && (
              <Link
                href={`/admin/suscripciones/${ticket.user.subscription.id}`}
                className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg transition-opacity hover:opacity-80"
                style={{
                  background: "rgba(76,214,160,0.08)",
                  border: "1px solid rgba(76,214,160,0.20)",
                }}
              >
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      ticket.user.subscription.status === "active" ? "#4cd6a0" : "#ff8585",
                  }}
                />
                <span className="text-[11px]" style={{ ...monoSmall, color: "#4cd6a0", textTransform: "none" }}>
                  {ticket.user.subscription.planId || "Plan"} ·{" "}
                  {ticket.user.subscription.status}
                </span>
                <ExternalLink className="h-3 w-3 ml-auto" style={{ color: "rgba(76,214,160,0.50)" }} />
              </Link>
            )}
          </div>

          {/* Ticket meta */}
          <div
            className="rounded-2xl p-5"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[10px] uppercase mb-4" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)" }}>
              Información
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)", textTransform: "none" }}>
                  <Calendar className="h-3 w-3" />
                  <span className="text-[11px]">Creado</span>
                </div>
                <span className="text-[11px] text-foreground/70" style={{ fontFamily: "var(--font-mono)" }}>
                  {new Date(ticket.createdAt).toLocaleDateString("es-CO")}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)", textTransform: "none" }}>
                  <Tag className="h-3 w-3" />
                  <span className="text-[11px]">Categoría</span>
                </div>
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{
                    ...monoSmall,
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.55)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)", textTransform: "none" }}>
                  Prioridad
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ ...monoSmall, ...priorityStyle(ticket.priority) }}
                >
                  {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)", textTransform: "none" }}>
                  Estado
                </span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{ ...monoSmall, ...statusStyle(ticket.status) }}
                >
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
              </div>
            </div>
          </div>

          {/* Recent tickets */}
          {recentTickets.length > 0 && (
            <div
              className="rounded-2xl p-5"
              style={{ background: "var(--card)", border: "1px solid var(--border)" }}
            >
              <p className="text-[10px] uppercase mb-4" style={{ ...monoSmall, color: "rgba(255,255,255,0.35)" }}>
                Otros tickets del usuario
              </p>
              <div className="space-y-2">
                {recentTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/admin/tickets/${t.id}`}
                    className="flex items-center gap-2 p-2 rounded-lg transition-colors hover:bg-white/[0.03]"
                  >
                    <div
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{
                        background:
                          t.status === "open"
                            ? "#ff8585"
                            : t.status === "pending"
                              ? "#ffb958"
                              : t.status === "resolved"
                                ? "#4cd6a0"
                                : "rgba(255,255,255,0.30)",
                      }}
                    />
                    <p className="text-[12px] text-foreground/70 truncate flex-1">{t.subject}</p>
                    <span
                      className="text-[9px] flex-shrink-0"
                      style={{ ...monoSmall, color: "rgba(255,255,255,0.25)" }}
                    >
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminGate>
      <TicketDetailContent id={id} />
    </AdminGate>
  );
}
