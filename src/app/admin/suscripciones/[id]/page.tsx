export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Calendar, User } from "lucide-react";
import { SubscriptionActions } from "./SubscriptionActions";
import { AddonToggles } from "./AddonToggles";
import { AdminNotes } from "./AdminNotes";
import { CopyButton } from "./CopyButton";

async function loadSubscription(id: string) {
  const [subscription, auditLogs] = await Promise.all([
    db.subscription.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
            cargo: true,
            phone: true,
            company: true,
            city: true,
            createdAt: true,
          },
        },
      },
    }),
    db.adminAuditLog.findMany({
      where: { targetType: "subscription", targetId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { admin: { select: { name: true, email: true } } },
    }),
  ]);
  return { subscription, auditLogs };
}

function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[9.5px] uppercase text-muted-foreground/60 mb-0.5"
      style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
    >
      {children}
    </p>
  );
}

function SectionCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {title && (
        <div className="px-5 py-3.5 border-b border-border">
          <p
            className="text-[10px] uppercase text-muted-foreground/60"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
          >
            {title}
          </p>
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

function MonoField({
  label,
  value,
  copyable,
}: {
  label: string;
  value?: string | null;
  copyable?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <MonoLabel>{label}</MonoLabel>
      <div className="flex items-center gap-2 mt-0.5">
        <p
          className="text-[11px] text-foreground/80 break-all flex-1"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value}
        </p>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  );
}

function statusBadge(s: string) {
  if (s === "active") return <Badge variant="ok">activa</Badge>;
  if (s === "past_due") return <Badge variant="destructive">past_due</Badge>;
  if (s === "canceled") return <Badge variant="secondary">cancelada</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    "subscription.status_change": "Cambio de estado",
    "subscription.addons_change": "Add-ons modificados",
    "subscription.notes_update": "Nota actualizada",
    "subscription.plan_change": "Cambio de plan",
    "user.role_change": "Cambio de rol",
  };
  return map[action] || action;
}

export default async function SuscripcionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminGate>
      <SuscripcionDetail id={id} />
    </AdminGate>
  );
}

async function SuscripcionDetail({ id }: { id: string }) {
  const { subscription: sub, auditLogs } = await loadSubscription(id);

  if (!sub) notFound();

  const planLabel =
    sub.planId === "elite" ? "Elite" : sub.planId === "pro" ? "Pro" : sub.planId || "Free";

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="02 · Suscripciones"
        title={`${planLabel} — ${sub.user.name || sub.user.email}`}
        description={sub.user.email}
        action={
          <SubscriptionActions subscriptionId={sub.id} status={sub.status} />
        }
      />

      {/* Status banner for past_due */}
      {sub.status === "past_due" && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl border mb-6"
          style={{
            background: "rgba(255,111,111,0.06)",
            borderColor: "rgba(255,111,111,0.30)",
          }}
        >
          <p className="text-[13px] text-[#ff8585]">
            Esta suscripción tiene un pago atrasado. Coordina con ePayco antes de cancelar.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          {/* User card */}
          <SectionCard title="Usuario">
            <div className="flex items-center gap-4 mb-4">
              <div
                className="h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 text-base font-bold text-white"
                style={{
                  background: sub.user.image
                    ? undefined
                    : "linear-gradient(135deg, #7c5cff, #5a3cf0)",
                }}
              >
                {sub.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sub.user.image}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  (sub.user.name?.[0] || sub.user.email[0]).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-semibold text-foreground truncate">
                    {sub.user.name || sub.user.email.split("@")[0]}
                  </p>
                  <Badge variant={sub.user.role === "admin" ? "accent" : "secondary"}>
                    {sub.user.role}
                  </Badge>
                </div>
                <p
                  className="text-[11px] text-muted-foreground/70 truncate mt-0.5"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {sub.user.email}
                </p>
                {sub.user.company && (
                  <p className="text-[12px] text-muted-foreground/60 mt-0.5">
                    {sub.user.company}
                    {sub.user.city ? ` · ${sub.user.city}` : ""}
                  </p>
                )}
              </div>
            </div>
            <Link
              href={`/admin/usuarios/${sub.user.id}`}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium hover:text-foreground transition-colors"
              style={{ color: "#9a7fff" }}
            >
              <User className="h-3.5 w-3.5" />
              Ver perfil completo
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </SectionCard>

          {/* Billing card */}
          <SectionCard title="Facturación">
            <div className="space-y-0">
              <div className="py-2.5 border-b border-border flex items-center justify-between">
                <div>
                  <MonoLabel>Plan</MonoLabel>
                  <div className="mt-0.5">
                    {sub.planId === "elite" ? (
                      <Badge variant="warn">Elite — $200/mo</Badge>
                    ) : sub.planId === "pro" ? (
                      <Badge variant="accent">Pro — $20/mo</Badge>
                    ) : (
                      <Badge variant="outline">{sub.planId || "Free"}</Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <MonoLabel>Estado</MonoLabel>
                  <div className="mt-0.5">{statusBadge(sub.status)}</div>
                </div>
              </div>

              {(sub.currentPeriodStart || sub.currentPeriodEnd) && (
                <div className="py-2.5 border-b border-border">
                  <MonoLabel>Período actual</MonoLabel>
                  <div className="flex items-center gap-1.5 text-[12px] text-foreground mt-0.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
                    {sub.currentPeriodStart &&
                      new Date(sub.currentPeriodStart).toLocaleDateString("es-CO")}{" "}
                    →{" "}
                    {sub.currentPeriodEnd &&
                      new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")}
                  </div>
                </div>
              )}

              <MonoField
                label="ePayco Customer ID"
                value={sub.epaycoCustomerId}
                copyable
              />
              <MonoField
                label="ePayco Subscription ID"
                value={sub.epaycoSubscriptionId}
                copyable
              />
              <MonoField
                label="Última referencia ePayco"
                value={sub.epaycoRef}
                copyable
              />
            </div>
          </SectionCard>

          {/* Add-ons */}
          <SectionCard title="Add-ons">
            <AddonToggles
              subscriptionId={sub.id}
              initialAddons={sub.addonAgents || []}
              planId={sub.planId}
            />
          </SectionCard>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          {/* Admin notes */}
          <SectionCard title="Notas del administrador">
            <AdminNotes
              subscriptionId={sub.id}
              initialNotes={sub.adminNotes}
            />
          </SectionCard>

          {/* Audit log */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p
                className="text-[10px] uppercase text-muted-foreground/60"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
              >
                Registro de auditoría
              </p>
            </div>
            {auditLogs.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground/50 text-center">
                Sin acciones registradas aún.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {auditLogs.map((log) => {
                  const meta = log.metadata as Record<string, unknown> | null;
                  return (
                    <div key={log.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-medium text-foreground">
                            {auditActionLabel(log.action)}
                          </p>
                          <p
                            className="text-[11px] text-muted-foreground/60 mt-0.5 truncate"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            {log.admin.name || log.admin.email}
                          </p>
                          {meta && Boolean(meta.from ?? meta.to) && (
                            <p
                              className="text-[10px] text-muted-foreground/50 mt-1"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {String(meta.from ?? "—")} → {String(meta.to ?? "—")}
                            </p>
                          )}
                        </div>
                        <span
                          className="text-[10px] text-muted-foreground/40 whitespace-nowrap"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {new Date(log.createdAt).toLocaleString("es-CO", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
