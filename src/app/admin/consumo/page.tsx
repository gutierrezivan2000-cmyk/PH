export const dynamic = "force-dynamic";

import Link from "next/link";
import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { personas, registrosDelPeriodo, TOPE_DE_REGISTROS } from "@/lib/consumo/consultas";
import { PRECIOS_VERIFICADOS_EL } from "@/lib/consumo/precios";
import { diaEnBogota, informeDeConsumo, periodoPedido, type Distribucion } from "@/lib/consumo/reporte";
import { Activity, AlertTriangle, Boxes, DollarSign, Download, Layers, ListTree, Mic, Users } from "lucide-react";
import { tinte } from "@/lib/tinte";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Busqueda = Promise<{ [clave: string]: string | string[] | undefined }>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function ConsumoPage({ searchParams }: { searchParams: Busqueda }) {
  const q = await searchParams;
  return (
    <AdminGate>
      <ConsumoContent desde={uno(q.desde)} hasta={uno(q.hasta)} />
    </AdminGate>
  );
}

/** Los atajos de periodo (días de Bogotá). */
function atajos(ahora: Date) {
  const hoy = diaEnBogota(ahora);
  const [a, m] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7))];
  const mesAnterior = m === 1 ? { a: a - 1, m: 12 } : { a, m: m - 1 };
  const finMesAnterior = new Date(Date.UTC(mesAnterior.a, mesAnterior.m, 0)).toISOString().slice(0, 10);
  const hace30 = diaEnBogota(new Date(ahora.getTime() - 29 * 86_400_000));
  const dos = (n: number) => String(n).padStart(2, "0");
  return [
    { nombre: "Este mes", desde: `${hoy.slice(0, 8)}01`, hasta: hoy },
    { nombre: "Mes anterior", desde: `${mesAnterior.a}-${dos(mesAnterior.m)}-01`, hasta: finMesAnterior },
    { nombre: "Últimos 30 días", desde: hace30, hasta: hoy },
    { nombre: "Este año", desde: `${a}-01-01`, hasta: hoy },
  ];
}

async function ConsumoContent({ desde, hasta }: { desde: string | null; hasta: string | null }) {
  const ahora = new Date();
  const periodo = periodoPedido(desde, hasta, ahora);
  const [{ registros, truncado }, batches, failures] = await Promise.all([
    registrosDelPeriodo(periodo),
    db.generationBatch.findMany({ where: { status: "processing" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.generation.findMany({
      where: { status: "failed" },
      include: { property: { select: { name: true } }, user: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);
  const informe = informeDeConsumo(registros);
  const batchIds = batches.map((b) => b.id);
  const doneByBatch = batchIds.length
    ? await db.generation.groupBy({ by: ["batchId"], where: { batchId: { in: batchIds }, status: "completed" }, _count: { id: true } })
    : [];
  const doneMap = Object.fromEntries(doneByBatch.map((d) => [d.batchId, d._count.id]));
  const gente = await personas([...new Set([...informe.porUsuario.map((u) => u.userId), ...batches.map((b) => b.userId)])]);

  const qs = `desde=${periodo.desdeDia}&hasta=${periodo.hastaDia}`;
  const csv = (vista: string) => `/api/admin/consumo?${qs}&formato=csv&vista=${vista}`;
  const t = informe.total;
  const horas = t.audioSegundos / 3600;

  return (
    <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-10 max-w-7xl">
      <PageHeader
        section="06 · Consumo IA"
        title="Consumo de IA por función y por cliente"
        description="Cuánto cuesta cada función y cada cliente, con los tokens separados como se cobran. Sirve para precificar y armar los planes."
      />

      {/* Periodo */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-6 flex flex-wrap items-end gap-3">
        <form className="flex flex-wrap items-end gap-3" action="/admin/consumo" method="get">
          <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
            Desde
            <input type="date" name="desde" defaultValue={periodo.desdeDia} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
            Hasta
            <input type="date" name="hasta" defaultValue={periodo.hastaDia} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
          <button type="submit" className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium">Ver periodo</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {atajos(ahora).map((a) => (
            <Link key={a.nombre} href={`/admin/consumo?desde=${a.desde}&hasta=${a.hasta}`} className="rounded-full border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground">
              {a.nombre}
            </Link>
          ))}
        </div>
      </div>

      {truncado && (
        <p className="mb-4 rounded-xl border border-border px-4 py-3 text-[13px]" style={{ color: "var(--warn-text)" }}>
          El periodo tiene más de {TOPE_DE_REGISTROS.toLocaleString("es-CO")} registros: se muestran los primeros. Acorta el periodo para verlo completo.
        </p>
      )}

      {/* Totales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-3">
        <StatCard icon={DollarSign} tint="var(--ok)" label="Costo de IA" value={usd(t.costoUsd)} sub={`${t.veces.toLocaleString("es-CO")} usos en el periodo`} />
        <StatCard icon={Users} tint="var(--accent)" label="Clientes con consumo" value={String(t.usuarios)} sub={t.usuarios ? `${usd(t.costoUsd / t.usuarios)} por cliente en promedio` : "—"} />
        <StatCard icon={Activity} tint="var(--accent)" label="Tokens" value={compacto(t.entrada + t.salida + t.cacheLectura + t.cacheEscritura)} sub={`entrada ${compacto(t.entrada)} · salida ${compacto(t.salida)} · caché ${compacto(t.cacheLectura + t.cacheEscritura)}`} />
        <StatCard icon={Mic} tint="var(--warn)" label="Audio transcrito" value={`${horas.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`} sub="reuniones y audios subidos" />
      </div>
      <p className="text-[12px] text-muted-foreground mb-8">
        Precios verificados el {PRECIOS_VERIFICADOS_EL}; cada registro guarda el costo con el precio del día en que se hizo.
        {t.estimados > 0 &&
          ` ${t.estimados.toLocaleString("es-CO")} registros (${usd(t.costoEstimadoUsd)}) son anteriores a la medición por función: su costo es una tarifa aproximada y no tienen el detalle de tokens.`}
        {" "}Por proveedor: {informe.porProveedor.map((p) => `${p.proveedor} ${usd(p.costoUsd)}`).join(" · ") || "—"}.
      </p>

      {/* Por función */}
      <SectionCard title="Costo por función" icon={ListTree} accion={<Descarga href={csv("funciones")} />}>
        {informe.porFuncion.length === 0 ? (
          <Empty text="Sin consumo registrado en el periodo." />
        ) : (
          <Tabla encabezados={["Función", "Veces", "Clientes", "Costo total", "Por vez: promedio · mediana · p90", "Tokens (entrada / salida / caché)", "Audio"]}>
            {informe.porFuncion.map((f) => (
              <tr key={f.tipo} className="hover:bg-secondary/40 transition-colors align-top">
                <td className="px-4 py-2.5 min-w-[220px]">
                  <p className="text-foreground">{f.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.grupo} · por {f.unidad}
                    {f.modelos.length > 0 && ` · ${f.modelos.join(", ")}`}
                    {f.estimados > 0 && ` · ${f.estimados} estimados`}
                  </p>
                </td>
                <Num>{f.veces.toLocaleString("es-CO")}</Num>
                <Num>{f.usuarios}</Num>
                <Num fuerte>{usd(f.costoUsd)}</Num>
                <Num>{dist(f.porVez)}</Num>
                <Num>{`${compacto(f.entrada)} / ${compacto(f.salida)} / ${compacto(f.cacheLectura + f.cacheEscritura)}`}</Num>
                <Num>{f.audioSegundos > 0 ? `${(f.audioSegundos / 3600).toFixed(1)} h${f.usdPorHoraDeAudio !== null ? ` · ${usd(f.usdPorHoraDeAudio)}/h` : ""}` : "—"}</Num>
              </tr>
            ))}
          </Tabla>
        )}
      </SectionCard>

      {/* Por operación completa */}
      <SectionCard title="Costo por operación completa" icon={Boxes} accion={<Descarga href={csv("productos")} />}>
        {informe.porProducto.length === 0 ? (
          <Empty text="Sin operaciones con el detalle en el periodo (la medición por operación empieza con esta versión)." />
        ) : (
          <Tabla encabezados={["Operación", "Cuántas", "Costo total", "Por operación: promedio · mediana · p90", "Máximo", "Por hora de audio", "Cómo se reparte (por operación)"]}>
            {informe.porProducto.map((p) => (
              <tr key={p.tipo} className="hover:bg-secondary/40 transition-colors align-top">
                <td className="px-4 py-2.5 min-w-[220px] text-foreground">{p.nombre}</td>
                <Num>{p.operaciones.toLocaleString("es-CO")}</Num>
                <Num fuerte>{usd(p.costoUsd)}</Num>
                <Num>{dist(p.porOperacion)}</Num>
                <Num>{usd(p.porOperacion.maximo)}</Num>
                <Num>{p.usdPorHoraDeAudio !== null ? usd(p.usdPorHoraDeAudio) : "—"}</Num>
                <td className="px-4 py-2.5 min-w-[280px] text-[12px] text-muted-foreground">
                  {p.composicion.slice(0, 5).map((c) => `${c.nombre}: ${usd(c.porOperacion)}`).join(" · ")}
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </SectionCard>

      {/* Por cliente */}
      <SectionCard title="Costo por cliente" icon={Users} accion={<Descarga href={csv("usuarios")} etiqueta="CSV cliente × función" />}>
        {informe.porUsuario.length === 0 ? (
          <Empty text="Sin consumo registrado en el periodo." />
        ) : (
          <Tabla encabezados={["Cliente", "Plan", "Costo", "Usos", "Tokens", "Audio", "En qué se le fue"]}>
            {informe.porUsuario.slice(0, 100).map((u) => {
              const p = gente.get(u.userId);
              return (
                <tr key={u.userId} className="hover:bg-secondary/40 transition-colors align-top">
                  <td className="px-4 py-2.5 max-w-[260px]">
                    <p className="text-foreground truncate">{p?.nombre || p?.email || u.userId}</p>
                    {p?.nombre && <p className="text-[11px] text-muted-foreground truncate">{p.email}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-[12px] text-muted-foreground">{p?.plan ?? "—"}</td>
                  <Num fuerte>{usd(u.costoUsd)}</Num>
                  <Num>{u.veces.toLocaleString("es-CO")}</Num>
                  <Num>{compacto(u.tokens)}</Num>
                  <Num>{u.audioSegundos > 0 ? `${(u.audioSegundos / 3600).toFixed(1)} h` : "—"}</Num>
                  <td className="px-4 py-2.5 min-w-[320px] text-[12px] text-muted-foreground">
                    {u.porTipo.slice(0, 3).map((x) => `${x.nombre} ${usd(x.costoUsd)} (${x.veces})`).join(" · ")}
                  </td>
                </tr>
              );
            })}
          </Tabla>
        )}
        {informe.porUsuario.length > 100 && <p className="px-5 py-3 text-[12px] text-muted-foreground">Se muestran los 100 que más gastaron; el CSV los trae todos.</p>}
      </SectionCard>

      <p className="text-[12px] text-muted-foreground mb-8">
        <a href={csv("registros")} className="underline">Descargar cada llamada del periodo (CSV)</a> para analizar aparte: fecha, cliente, función, proveedor, modelo,
        tokens, segundos de audio, costo y la operación a la que pertenece.
      </p>

      {/* Lotes en curso */}
      <SectionCard title="Lotes en curso" icon={Layers}>
        {batches.length === 0 ? (
          <Empty text="No hay lotes generándose ahora." />
        ) : (
          <ul className="divide-y divide-border">
            {batches.map((b) => {
              const owner = gente.get(b.userId);
              return (
                <li key={b.id} className="px-5 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{owner?.nombre || owner?.email || "Cliente"}</p>
                    <p className="text-[11px] text-muted-foreground" style={{ fontFamily: "var(--font-mono)" }}>
                      {MONTHS[(b.month - 1) % 12]} {b.year} · {b.docTypes.join(", ")}
                    </p>
                  </div>
                  <span className="text-[12px] tabular-nums" style={{ fontFamily: "var(--font-mono)", color: "var(--accent-text)" }}>
                    {doneMap[b.id] ?? 0}/{b.total}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Fallos recientes */}
      <SectionCard title="Generaciones fallidas recientes" icon={AlertTriangle}>
        {failures.length === 0 ? (
          <Empty text="Sin fallos recientes." />
        ) : (
          <ul className="divide-y divide-border">
            {failures.map((g) => (
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

/** US$ con los decimales que hacen falta: los centavos de una pregunta no se pierden. */
function usd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "US$ 0";
  const decimales = n >= 100 ? 0 : n >= 1 ? 2 : n >= 0.01 ? 3 : 4;
  return `US$ ${n.toLocaleString("es-CO", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}`;
}

function compacto(n: number): string {
  return n.toLocaleString("es-CO", { notation: "compact", maximumFractionDigits: 1 });
}

const dist = (d: Distribucion): string => (d.n === 0 ? "—" : `${usd(d.promedio)} · ${usd(d.mediana)} · ${usd(d.p90)}`);

function Num({ children, fuerte }: { children: React.ReactNode; fuerte?: boolean }) {
  return (
    <td className={`px-4 py-2.5 tabular-nums whitespace-nowrap ${fuerte ? "text-foreground font-medium" : "text-muted-foreground"}`} style={{ fontFamily: "var(--font-mono)" }}>
      {children}
    </td>
  );
}

function Tabla({ encabezados, children }: { encabezados: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border" style={{ background: "rgb(var(--veil-rgb) / 0.02)" }}>
            {encabezados.map((h) => (
              <th key={h} className="px-4 py-3 text-left whitespace-nowrap" style={{ fontFamily: "var(--font-mono)", fontSize: "10px", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

function Descarga({ href, etiqueta = "CSV" }: { href: string; etiqueta?: string }) {
  return (
    <a href={href} className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground">
      <Download className="h-3.5 w-3.5" />
      {etiqueta}
    </a>
  );
}

function StatCard({ icon: Icon, tint, label, value, sub }: { icon: typeof Activity; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-4" style={{ background: `${tinte(tint, 0.1)}`, color: tint }}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] uppercase text-muted-foreground/70 mb-1" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}>{label}</p>
      <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-mono)" }}>{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, accion }: { title: string; icon: typeof Activity; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {accion}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">{text}</p>;
}
