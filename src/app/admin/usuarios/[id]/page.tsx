export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Building2,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  FileText,
  MessageSquare,
  Zap,
  Ban,
} from "lucide-react";
import { RoleButton } from "./RoleButton";
import { BanButton } from "./BanButton";

async function loadUser(id: string) {
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [user, recentGenerations, recentTickets, generations30d, agentChatCount, admin] =
    await Promise.all([
      db.user.findUnique({
        where: { id },
        include: {
          subscription: true,
          accounts: { select: { provider: true } },
          _count: {
            select: {
              properties: true,
              generations: true,
              tickets: true,
              agentChats: true,
            },
          },
        },
      }),
      db.generation.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { property: { select: { name: true } } },
      }),
      db.ticket.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.generation.count({ where: { userId: id, createdAt: { gte: last30 } } }),
      db.agentChat.count({ where: { userId: id } }),
      requireAdmin(),
    ]);

  return { user, recentGenerations, recentTickets, generations30d, agentChatCount, admin };
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

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <MonoLabel>{label}</MonoLabel>
        <p className="text-[13px] text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

function ticketStatusBadge(status: string) {
  if (status === "open") return <Badge variant="ok">abierto</Badge>;
  if (status === "pending") return <Badge variant="warn">pendiente</Badge>;
  if (status === "resolved") return <Badge variant="secondary">resuelto</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

export default async function UsuarioDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminGate>
      <UsuarioDetail id={id} />
    </AdminGate>
  );
}

async function UsuarioDetail({ id }: { id: string }) {
  const { user, recentGenerations, recentTickets, generations30d, agentChatCount, admin } =
    await loadUser(id);

  if (!user) notFound();

  const isGoogle = user.accounts.some((a) => a.provider === "google");
  const isSelf = admin?.userId === user.id;
  const sub = user.subscription;

  const addonNames: Record<string, string> = {
    metra: "Metra",
    nomethes: "Nomethes",
    hermes: "Hermes",
    logistes: "Logistes",
  };

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="01 · Usuarios"
        title={user.name || user.email}
        description={user.email}
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <Link
              href={`/admin/usuarios/${user.id}/propiedades`}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
            >
              Ver propiedades ({user._count.properties})
            </Link>
            <RoleButton
              userId={user.id}
              currentRole={user.role}
              isSelf={isSelf}
            />
            <BanButton userId={user.id} banned={user.banned} isSelf={isSelf} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          {/* Profile */}
          <SectionCard title="Perfil">
            <div className="flex items-center gap-4 mb-5">
              <div
                className="h-14 w-14 rounded-full flex items-center justify-center flex-shrink-0 text-lg font-bold text-white"
                style={{
                  background: user.image
                    ? undefined
                    : "linear-gradient(135deg, #7c5cff, #5a3cf0)",
                }}
              >
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.image}
                    alt={user.name || ""}
                    className="h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  (user.name?.[0] || user.email[0]).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[16px] font-semibold text-foreground">
                    {user.name || <span className="italic text-muted-foreground">Sin nombre</span>}
                  </span>
                  <Badge variant={user.role === "admin" ? "accent" : "secondary"}>
                    {user.role}
                  </Badge>
                  {user.banned && <Badge variant="destructive">Baneado</Badge>}
                </div>
                <p
                  className="text-[12px] text-muted-foreground mt-0.5"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {user.email}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span
                    className="text-[10px] px-2.5 py-1 rounded-full border"
                    style={{
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "0.1em",
                      background: isGoogle
                        ? "rgba(76,214,160,0.08)"
                        : "rgba(255,255,255,0.05)",
                      borderColor: isGoogle
                        ? "rgba(76,214,160,0.30)"
                        : "rgba(255,255,255,0.10)",
                      color: isGoogle ? "#4cd6a0" : "rgba(255,255,255,0.50)",
                    }}
                  >
                    {isGoogle ? "Google Account" : "Email login"}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-0">
              <div className="py-2.5 border-b border-border">
                <MonoLabel>Registro</MonoLabel>
                <p className="text-[13px] text-foreground">
                  {new Date(user.createdAt).toLocaleString("es-CO", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="py-2.5">
                <MonoLabel>Onboarding</MonoLabel>
                <Badge variant={user.onboarded ? "ok" : "secondary"}>
                  {user.onboarded ? "Completado" : "Pendiente"}
                </Badge>
              </div>
            </div>

            {user.banned && (
              <div
                className="mt-4 rounded-xl border p-3.5"
                style={{
                  background: "rgba(255,111,111,0.06)",
                  borderColor: "rgba(255,111,111,0.25)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Ban className="h-3.5 w-3.5 text-[#ff8585]" />
                  <p className="text-[12px] font-medium text-[#ff8585]">
                    Cuenta baneada
                  </p>
                </div>
                <p className="text-[11.5px] text-muted-foreground/80 leading-snug">
                  Este usuario no puede iniciar sesión.
                  {user.bannedAt && (
                    <>
                      {" "}Desde el{" "}
                      {new Date(user.bannedAt).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      .
                    </>
                  )}
                </p>
                {user.banReason && (
                  <p className="text-[11.5px] text-foreground/70 mt-1.5">
                    <span className="text-muted-foreground/60">Motivo:</span>{" "}
                    {user.banReason}
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          {/* Contact */}
          {(user.cargo || user.phone || user.company || user.city) && (
            <SectionCard title="Contacto">
              <div className="space-y-0">
                <InfoRow icon={Briefcase} label="Cargo" value={user.cargo} />
                <InfoRow icon={Phone} label="Teléfono" value={user.phone} />
                <InfoRow icon={Building2} label="Empresa" value={user.company} />
                <InfoRow icon={MapPin} label="Ciudad" value={user.city} />
              </div>
            </SectionCard>
          )}

          {/* Subscription */}
          <SectionCard title="Suscripción">
            {!sub ? (
              <p className="text-sm text-muted-foreground/60">Sin suscripción activa.</p>
            ) : (
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5 border-b border-border">
                  <div>
                    <MonoLabel>Plan</MonoLabel>
                    <div className="flex items-center gap-2 mt-0.5">
                      {sub.planId === "elite" ? (
                        <Badge variant="warn">Elite</Badge>
                      ) : sub.planId === "pro" ? (
                        <Badge variant="accent">Pro</Badge>
                      ) : (
                        <Badge variant="outline">{sub.planId || "Free"}</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <MonoLabel>Estado</MonoLabel>
                    {sub.status === "active" ? (
                      <Badge variant="ok">activa</Badge>
                    ) : sub.status === "past_due" ? (
                      <Badge variant="destructive">past_due</Badge>
                    ) : sub.status === "canceled" ? (
                      <Badge variant="secondary">cancelada</Badge>
                    ) : (
                      <Badge variant="outline">{sub.status}</Badge>
                    )}
                  </div>
                </div>

                {sub.currentPeriodEnd && (
                  <div className="py-2.5 border-b border-border">
                    <MonoLabel>Período actual</MonoLabel>
                    <div className="flex items-center gap-1.5 text-[13px] text-foreground mt-0.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/50" />
                      {sub.currentPeriodStart &&
                        new Date(sub.currentPeriodStart).toLocaleDateString("es-CO")}{" "}
                      →{" "}
                      {new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO")}
                    </div>
                  </div>
                )}

                {sub.epaycoCustomerId && (
                  <div className="py-2 border-b border-border">
                    <MonoLabel>ePayco Customer ID</MonoLabel>
                    <p
                      className="text-[11px] text-muted-foreground/80 mt-0.5 break-all"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {sub.epaycoCustomerId}
                    </p>
                  </div>
                )}

                {sub.epaycoSubscriptionId && (
                  <div className="py-2 border-b border-border">
                    <MonoLabel>ePayco Sub ID</MonoLabel>
                    <p
                      className="text-[11px] text-muted-foreground/80 mt-0.5 break-all"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {sub.epaycoSubscriptionId}
                    </p>
                  </div>
                )}

                {sub.addonAgents && sub.addonAgents.length > 0 && (
                  <div className="py-2.5 border-b border-border">
                    <MonoLabel>Add-ons activos</MonoLabel>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {sub.addonAgents.map((a) => (
                        <Badge key={a} variant="accent" className="text-[10px]">
                          {addonNames[a] || a}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2.5">
                  <Link
                    href={`/admin/suscripciones/${sub.id}`}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium hover:text-foreground transition-colors"
                    style={{ color: "#9a7fff" }}
                  >
                    Ir a suscripción
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          {/* Activity summary */}
          <SectionCard title="Actividad">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Propiedades", value: user._count.properties, icon: Building2 },
                { label: "Generaciones total", value: user._count.generations, icon: FileText },
                { label: "Generaciones 30d", value: generations30d, icon: Zap },
                { label: "Tickets", value: user._count.tickets, icon: MessageSquare },
                { label: "Chats IA", value: agentChatCount, icon: MessageSquare },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-background/50 p-3.5"
                >
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground/50 mb-2" />
                  <p className="text-xl font-semibold text-foreground tracking-tight">
                    {item.value.toLocaleString("es-CO")}
                  </p>
                  <MonoLabel>{item.label}</MonoLabel>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Recent generations */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p
                className="text-[10px] uppercase text-muted-foreground/60"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
              >
                Generaciones recientes
              </p>
            </div>
            {recentGenerations.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground/50">
                Sin generaciones aún.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentGenerations.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center gap-4 px-5 py-3"
                  >
                    <span
                      className="text-[9.5px] px-2 py-1 rounded-full border whitespace-nowrap"
                      style={{
                        fontFamily: "var(--font-mono)",
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        background: "rgba(124,92,255,0.08)",
                        borderColor: "rgba(124,92,255,0.30)",
                        color: "#9a7fff",
                      }}
                    >
                      {g.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-foreground/80 truncate">
                        {g.property.name}
                      </p>
                    </div>
                    <span
                      className="text-[11px] text-muted-foreground/50 whitespace-nowrap"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {new Date(g.createdAt).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent tickets */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p
                className="text-[10px] uppercase text-muted-foreground/60"
                style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
              >
                Tickets recientes
              </p>
            </div>
            {recentTickets.length === 0 ? (
              <div className="px-5 py-6 text-sm text-muted-foreground/50">
                Sin tickets aún.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentTickets.map((t) => (
                  <Link
                    key={t.id}
                    href={`/admin/tickets/${t.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-foreground truncate">
                        {t.subject}
                      </p>
                      <p
                        className="text-[11px] text-muted-foreground/50 mt-0.5"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {new Date(t.createdAt).toLocaleDateString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          year: "2-digit",
                        })}
                      </p>
                    </div>
                    {ticketStatusBadge(t.status)}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
