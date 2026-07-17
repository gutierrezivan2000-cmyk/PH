export const dynamic = "force-dynamic";

import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { Layers, Activity, AlertTriangle, DollarSign } from "lucide-react";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

async function load() {
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [batches, aiByUser, totals, failures] = await Promise.all([
    db.generationBatch.findMany({ where: { status: "processing" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.usageRecord.groupBy({
      by: ["userId"],
      where: { date: { gte: startOfMonth } },
      _sum: { costUsd: true, tokens: true },
      _count: { id: true },
    }),
    db.usageRecord.aggregate({ where: { date: { gte: startOfMonth } }, _sum: { costUsd: true, tokens: true } }),
    db.generation.findMany({
      where: { status: "failed" },
      include: { property: { select: { name: true } }, user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  // Progress for in-progress batches.
  const batchIds = batches.map((b) => b.id);
  const doneByBatch = batchIds.length
    ? await db.generation.groupBy({ by: ["batchId"], where: { batchId: { in: batchIds }, status: "completed" }, _count: { id: true } })
    : [];
  const doneMap = Object.fromEntries(doneByBatch.map((d) => [d.batchId, d._count.id]));
  const batchUserIds = [...new Set(batches.map((b) => b.userId))];

  // Names for the top AI-cost users + batch owners.
  const topUsers = [...aiByUser].sort((a, b) => (b._sum.costUsd ?? 0) - (a._sum.costUsd ?? 0)).slice(0, 30);
  const userIds = [...new Set([...topUsers.map((u) => u.userId), ...batchUserIds])];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } });
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  return {
    batches: batches.map((b) => ({ ...b, done: doneMap[b.id] ?? 0, owner: userMap[b.userId] })),
    topUsers: topUsers.map((u) => ({
      user: userMap[u.userId],
      cost: u._sum.costUsd ?? 0,
      tokens: u._sum.tokens ?? 0,
      records: u._count.id,
    })),
    totalCost: totals._sum.costUsd ?? 0,
    totalTokens: totals._sum.tokens ?? 0,
    failures,
  };
}

export default async function ConsumoPage() {
  return (
    <AdminGate>
      <ConsumoContent />
    </AdminGate>
  );
}

async function ConsumoContent() {
  const d = await load();
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="06 · Consumo IA"
        title="Consumo IA y operación"
        description="Costo real de IA por cliente este mes, lotes en curso y generaciones fallidas."
      />

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard icon={DollarSign} tint="#4cd6a0" label="Costo IA del mes" value={money(d.totalCost)} sub="todos los clientes" />
        <StatCard icon={Activity} tint="#7c5cff" label="Tokens del mes" value={d.totalTokens.toLocaleString("es-CO")} sub="entrada + salida" />
        <StatCard icon={Layers} tint="#ffb958" label="Lotes en curso" value={String(d.batches.length)} sub="generándose ahora" />
      </div>

      {/* Batches in progress */}
      <SectionCard title="Lotes en curso" icon={Layers}>
        {d.batches.length === 0 ? (
          <Empty text="No hay lotes generándose ahora." />
        ) : (
          <ul className="divide-y divide-border">
            {d.batches.map((b) => (
              <li key={b.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">
                    {b.owner?.name || b.owner?.email || "Cliente"}
                  </p>
                  <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                    {MONTHS[(b.month - 1) % 12]} {b.year} · {b.docTypes.join(", ")}
                  </p>
                </div>
                <span className="text-[12px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "#9a7fff" }}>
                  {b.done}/{b.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* AI cost per client */}
      <SectionCard title="Consumo IA por cliente (este mes)" icon={DollarSign}>
        {d.topUsers.length === 0 ? (
          <Empty text="Sin consumo registrado este mes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border" style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Cliente", "Costo IA", "Tokens", "Registros"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.topUsers.map((u, i) => (
                  <tr key={i} className="hover:bg-secondary/40 transition-colors">
                    <td className="px-4 py-2.5 text-foreground truncate max-w-[280px]">{u.user?.name || u.user?.email || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ fontFamily: "var(--font-mono)", color: u.cost > 20 ? "#ffb958" : "var(--muted-foreground)" }}>{money(u.cost)}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>{u.tokens.toLocaleString("es-CO")}</td>
                    <td className="px-4 py-2.5 tabular-nums text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>{u.records}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Recent failures */}
      <SectionCard title="Generaciones fallidas recientes" icon={AlertTriangle}>
        {d.failures.length === 0 ? (
          <Empty text="Sin fallos recientes. 🎉" />
        ) : (
          <ul className="divide-y divide-border">
            {d.failures.map((g) => (
              <li key={g.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <Badge variant="destructive">Error</Badge>
                  <span className="text-[13px] text-foreground truncate">{g.property?.name ?? "Propiedad"}</span>
                  <span className="text-[11px] text-muted-foreground/60 ml-auto whitespace-nowrap" style={{ fontFamily: "var(--font-mono)" }}>
                    {new Date(g.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  {g.user?.email} · {g.errorMessage || "sin detalle"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function StatCard({ icon: Icon, tint, label, value, sub }: { icon: typeof Activity; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: `${tint}1a`, color: tint }}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] uppercase text-muted-foreground/70 mb-1" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}>{label}</p>
      <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">{text}</p>;
}
