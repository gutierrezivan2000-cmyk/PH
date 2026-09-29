export const dynamic = "force-dynamic";

import { Building2, FileText, Sparkles, TriangleAlert } from "lucide-react";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import {
  Boton,
  CabeceraPieza,
  Cornisa,
  Kpi,
  Kpis,
  Medidor,
  Pagina,
  Panel,
  Pieza,
  Seccion,
  Vacio,
} from "@/components/kit";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/epayco";
import { TablaGeneraciones, type FilaGeneracion } from "./propiedades/PropertyFilters";

async function loadOverview(userId: string) {
  // Sin esta rama la página respondía 500 en demo: `db` es un stub y
  // `db.property.count` es undefined.
  if (process.env.DEMO_MODE === "true") {
    const { getDemoPortfolioOverview } = await import("@/lib/demo-store");
    return getDemoPortfolioOverview(userId);
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [totalProperties, generationsThisMonth, totalDocuments, recentReported, recent] =
    await Promise.all([
      db.property.count({ where: { userId } }),
      db.generation.count({
        where: { userId, status: "completed", createdAt: { gte: startOfMonth } },
      }),
      db.propertyDocument.count({ where: { property: { userId } } }),
      db.generation.groupBy({
        by: ["propertyId"],
        where: { userId, status: "completed", createdAt: { gte: last30 } },
      }),
      db.generation.findMany({
        where: { userId },
        include: { property: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

  return {
    totalProperties,
    generationsThisMonth,
    totalDocuments,
    withoutRecentReport: Math.max(0, totalProperties - recentReported.length),
    recent,
  };
}

export default async function EmpresaOverviewPage() {
  const elite = await eliteGate();
  const data = await loadOverview(elite.userId);
  const monthlyCap = elite.plan === "beta" ? null : PLANS.elite.limits.generationsPerMonth;

  const n = data.withoutRecentReport;
  const N = data.totalProperties;
  const cop = (x: number) => (x === 1 ? "copropiedad" : "copropiedades");
  const fmt = (x: number) => x.toLocaleString("es-CO");

  // Titular: la respuesta del día, derivada de los mismos conteos que ya se cargan
  // (propiedades sin informe completado en los últimos 30 días).
  const titular =
    N === 0
      ? { a: "Tu portafolio está vacío.", b: " Agrega tu primera copropiedad para empezar." }
      : n === 0
        ? { a: `${N === 1 ? "Tu copropiedad tiene" : `Las ${fmt(N)} copropiedades tienen`} informe reciente.`, b: " Nada pendiente en los últimos 30 días." }
        : { a: `${fmt(n)} de ${fmt(N)} ${cop(N)}`, b: " sin informe en los últimos 30 días." };

  const recientes: FilaGeneracion[] = data.recent.map((g) => ({
    id: g.id,
    month: g.month,
    year: g.year,
    status: g.status,
    createdAt: g.createdAt,
    propertyName: g.property?.name ?? "Propiedad eliminada",
  }));

  return (
    <EmpresaShell elite={elite}>
      <style href="k-empresa-portafolio" precedence="default">{CSS_PORTAFOLIO}</style>
      {/* Cornisa informativa (SPEC §f.1, /empresa): alcance del portafolio con datos reales. */}
      <Cornisa
        info={
          <>
            Portafolio · <b>{fmt(N)}</b> {cop(N)}
            {N > 0 && (
              <>
                {" "}· <b>{fmt(n)}</b> sin informe en los últimos 30 días
              </>
            )}
          </>
        }
      />
      <Pagina>
        <Pieza>
          <CabeceraPieza
            nn="01"
            titulo="Portafolio"
            subtitulo="Vista general de todas tus copropiedades y su actividad este mes."
            acciones={<Boton href="/empresa/generar" flecha="avanza">Generar en lote</Boton>}
          />

          <div className="emp-resumen">
            <p className="emp-titular k-t40">
              {titular.a}
              <span>{titular.b}</span>
            </p>
            <p className="emp-nota">
              Genera en lote los informes y actas del mes de las copropiedades que ya tienen sus datos cargados.
            </p>
          </div>

          {monthlyCap ? (
            <Panel className="emp-uso" titulo="Generaciones del mes" nota="informes y actas completados">
              <Medidor
                filas={[{ etiqueta: "Este mes", usado: data.generationsThisMonth, total: monthlyCap }]}
                libres={Math.max(0, monthlyCap - data.generationsThisMonth)}
                unidadLibres="libres este mes"
              />
            </Panel>
          ) : null}

          <Kpis className="emp-kpis">
            {!monthlyCap && (
              <Kpi icono={Sparkles} tono="ai" cifra={fmt(data.generationsThisMonth)} etiqueta="Generaciones del mes" variacion="ilimitado en beta" />
            )}
            <Kpi icono={Building2} tono="blue" cifra={fmt(N)} etiqueta="Propiedades" variacion="en tu portafolio" />
            <Kpi icono={TriangleAlert} tono={n > 0 ? "amber" : "green"} cifra={fmt(n)} etiqueta="Sin informe reciente" variacion="en los últimos 30 días" />
            <Kpi icono={FileText} tono="teal" cifra={fmt(data.totalDocuments)} etiqueta="Documentos cargados" variacion="reglamentos y manuales" />
          </Kpis>

          <Seccion
            id="emp-actividad"
            titulo="Actividad reciente"
            nota="últimas generaciones"
            enlace={{ href: "/empresa/propiedades", texto: "Ver propiedades", refIndice: "03" }}
          >
            <TablaGeneraciones
              etiquetaAccesible="Actividad reciente del portafolio"
              filas={recientes}
              conPropiedad
              vacio={
                <Vacio
                  nivel={3}
                  titulo="Aún no hay generaciones."
                  texto="Empieza generando en lote los informes del mes de tus copropiedades."
                  acciones={<Boton href="/empresa/generar" flecha="avanza">Generar en lote</Boton>}
                />
              }
            />
          </Seccion>
        </Pieza>
      </Pagina>
    </EmpresaShell>
  );
}

const CSS_PORTAFOLIO = `
.emp-resumen { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); align-items: end; margin: 44px 0 40px; }
.emp-titular { grid-column: 1 / 8; min-width: 0; margin: 0; text-wrap: balance; }
.emp-titular span { color: var(--ink-3); }
.emp-nota { grid-column: 8 / 13; margin: 0; font-size: 15px; line-height: 1.4; color: var(--ink-2); text-wrap: pretty; }
.emp-uso { margin-bottom: 40px; }
/* Con 100 generaciones el medidor agrupa en 40 celdas: con el hueco de 4 px no se verían. */
.emp-uso .k-celdas { gap: 3px; }
.emp-kpis { margin-bottom: 56px; }
@media (max-width: 1180px) {
  .emp-titular { grid-column: 1 / -1; font-size: 36px; }
  .emp-nota { grid-column: 1 / -1; margin-top: 12px; }
}
@media (max-width: 860px) {
  .emp-resumen { display: block; margin: 28px 0 32px; }
  .emp-titular { font-size: 32px; }
  .emp-uso .k-medidor-c { grid-template-columns: minmax(0, 1fr); row-gap: 16px; }
  .emp-uso .k-medidor { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .emp-uso .k-celdas { gap: 2px; }
  .emp-uso, .emp-kpis { margin-bottom: 40px; }
}
`;
