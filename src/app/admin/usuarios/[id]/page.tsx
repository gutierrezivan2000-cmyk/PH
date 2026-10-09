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
  Calendar,
  FileText,
  MessageSquare,
  Zap,
  Ban,
} from "lucide-react";
import { CAMPOS_DE_IDENTIDAD, codigoDeUsuario } from "@/lib/admin/identidad";
import { Persona, fechaLarga } from "@/components/admin/Persona";
import { LEGAL_VERSION } from "@/lib/legal/empresa";
import { informeDeConsumo } from "@/lib/consumo/reporte";
import { asegurarColumnasDeConsumo } from "@/lib/consumo/registrar";
import { AccesoButton } from "./AccesoButton";
import { RoleButton } from "./RoleButton";
import { esAdminDeEntorno } from "@/lib/admin-emails";
import { BanButton } from "./BanButton";

async function loadConsumo(id: string, desde: Date) {
  try {
    await asegurarColumnasDeConsumo();
    const registros = await db.usageRecord.findMany({
      where: { userId: id, date: { gte: desde } },
      select: {
        userId: true, type: true, date: true, costUsd: true, tokens: true, provider: true, model: true, inputTokens: true, outputTokens: true,
        cacheReadTokens: true, cacheWriteTokens: true, audioSeconds: true, refType: true, refId: true,
      },
      take: 50_000,
    });
    return informeDeConsumo(registros);
  } catch (e) {
    console.error("[admin usuario] consumo:", e);
    return null;
  }
}

async function loadUser(id: string) {
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [user, recentGenerations, recentTickets, generations30d, agentChatCount, admin] =
    await Promise.all([
      // Identidad, contacto y fechas; nunca el hash de la contraseña ni las credenciales de pago (ver lib/admin/identidad.ts).
      db.user.findUnique({
        where: { id },
        select: {
          ...CAMPOS_DE_IDENTIDAD,
          bannedAt: true,
          banReason: true,
          onboarded: true,
          subscription: {
            select: { id: true, planId: true, status: true, currentPeriodStart: true, currentPeriodEnd: true, addonAgents: true },
          },
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
        select: { id: true, type: true, createdAt: true },
      }),
      db.ticket.findMany({
        where: { userId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, subject: true, status: true, createdAt: true },
      }),
      db.generation.count({ where: { userId: id, createdAt: { gte: last30 } } }),
      db.agentChat.count({ where: { userId: id } }),
      requireAdmin(),
    ]);

  const consumo = await loadConsumo(id, last30);
  return { user, recentGenerations, recentTickets, generations30d, agentChatCount, admin, consumo };
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
  const { user, recentGenerations, recentTickets, generations30d, agentChatCount, admin, consumo } =
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
        description={`${user.email} · ${codigoDeUsuario(user.id)}`}
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <AccesoButton userId={user.id} />
            {esAdminDeEntorno(admin?.email) && (
            <RoleButton
              userId={user.id}
              currentRole={user.role}
              isSelf={isSelf}
            />
            )}
            <BanButton userId={user.id} banned={user.banned} isSelf={isSelf} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          {/* Profile */}
          <SectionCard title="Perfil">
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <Persona id={user.id} name={user.name} email={user.email} image={user.image} enlace={false} grande />
              <Badge variant={user.role === "admin" ? "accent" : "secondary"}>{user.role}</Badge>
              {user.banned && <Badge variant="destructive">Baneado</Badge>}
              <span
                className="text-[10px] px-2.5 py-1 rounded-full border"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.1em",
                  background: isGoogle ? "rgb(var(--ok-rgb) / 0.08)" : "rgb(var(--veil-rgb) / 0.05)",
                  borderColor: isGoogle ? "rgb(var(--ok-rgb) / 0.3)" : "rgb(var(--veil-rgb) / 0.1)",
                  color: isGoogle ? "var(--ok-text)" : "var(--ink-3)",
                }}
              >
                {isGoogle ? "Ingresa con Google" : "Ingresa con correo"}
              </span>
            </div>

            <div className="space-y-0">
              {(
                [
                  ["Registro", fechaLarga(user.createdAt)],
                  ["Último ingreso", user.lastLoginAt ? fechaLarga(user.lastLoginAt) : "Sin registro (anterior a esta medición)"],
                  ["Correo verificado", isGoogle ? "Verificado por Google" : user.emailVerified ? fechaLarga(user.emailVerified) : "No verificado"],
                  [
                    "Términos y privacidad",
                    user.termsAcceptedAt
                      ? `Aceptó la versión ${user.termsVersion} el ${fechaLarga(user.termsAcceptedAt)}${user.termsVersion === LEGAL_VERSION ? "" : " (hay una versión más nueva)"}`
                      : "Sin aceptación registrada",
                  ],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="py-2.5 border-b border-border">
                  <MonoLabel>{k}</MonoLabel>
                  <p className="text-[13px] text-foreground">{v}</p>
                </div>
              ))}
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
                  background: "rgb(var(--danger-rgb) / 0.06)",
                  borderColor: "rgb(var(--danger-rgb) / 0.25)",
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Ban className="h-3.5 w-3.5 text-[var(--danger)]" />
                  <p className="text-[12px] font-medium text-[var(--danger)]">
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

          {/* Contacto */}
          <SectionCard title="Contacto">
            <div className="space-y-0">
              {(
                [
                  ["Correo", user.email],
                  ["Teléfono", user.phone],
                  ["Cargo", user.cargo],
                  ["Empresa", user.company],
                  ["Ciudad", user.city],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="py-2.5 border-b border-border last:border-0">
                  <MonoLabel>{k}</MonoLabel>
                  {v ? (
                    k === "Correo" ? (
                      <a href={`mailto:${v}`} className="text-[13px] underline underline-offset-2" style={{ color: "var(--accent-text)" }}>{v}</a>
                    ) : k === "Teléfono" ? (
                      <a href={`tel:${v.replace(/[^+\d]/g, "")}`} className="text-[13px] underline underline-offset-2" style={{ color: "var(--accent-text)" }}>{v}</a>
                    ) : (
                      <p className="text-[13px] text-foreground">{v}</p>
                    )
                  ) : (
                    <p className="text-[13px] text-muted-foreground/60">No lo ha registrado</p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>

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
                    style={{ color: "var(--accent-text)" }}
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

          {/* Consumo de IA */}
          <SectionCard title="Consumo de IA · últimos 30 días">
            {!consumo || consumo.total.veces === 0 ? (
              <p className="text-sm text-muted-foreground/60">Sin consumo registrado.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <p className="text-2xl font-semibold tracking-tight text-foreground">US$ {consumo.total.costoUsd.toFixed(consumo.total.costoUsd < 1 ? 3 : 2)}</p>
                  <MonoLabel>{consumo.total.veces.toLocaleString("es-CO")} usos</MonoLabel>
                </div>
                <ul className="divide-y divide-border">
                  {consumo.porFuncion.slice(0, 8).map((f) => (
                    <li key={f.tipo} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                      <span className="text-foreground/80 truncate">{f.nombre}</span>
                      <span className="text-muted-foreground whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>
                        {f.veces}× · US$ {f.costoUsd.toFixed(f.costoUsd < 1 ? 3 : 2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link href="/admin/consumo" className="inline-flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--accent-text)" }}>
                  Ver el consumo de todos <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
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
                        background: "rgb(var(--accent-rgb) / 0.08)",
                        borderColor: "rgb(var(--accent-rgb) / 0.3)",
                        color: "var(--accent-text)",
                      }}
                    >
                      {g.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] text-foreground/80 truncate">
                        Generación de {g.type}
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
