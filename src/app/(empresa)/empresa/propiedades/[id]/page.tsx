export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eliteGate } from "@/components/empresa/EmpresaGate";
import { EmpresaShell } from "@/components/empresa/EmpresaShell";
import { MonthlyDataCard } from "@/components/empresa/MonthlyDataCard";
import { Boton, BotonFila, CabeceraPieza, Pagina, Panel, Pieza, Resumen, Seccion, TipoArchivo, Vacio, tipoDeArchivo } from "@/components/kit";
import { db } from "@/lib/db";
import { TablaGeneraciones, type FilaGeneracion } from "../PropertyFilters";

const DOC_TYPE_LABELS: Record<string, string> = {
  reglamento_interno: "Reglamento interno",
  manual_convivencia: "Manual de convivencia",
  otro: "Otro documento",
};

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const elite = await eliteGate();
  const { id } = await params;

  const loaded =
    process.env.DEMO_MODE === "true"
      ? await import("@/lib/demo-store").then((m) => m.getDemoPortfolioProperty(id, elite.userId))
      : await (async () => {
          const p = await db.property.findFirst({
            where: { id, userId: elite.userId },
            include: { documents: { orderBy: { createdAt: "desc" } } },
          });
          if (!p) return null;
          return {
            property: p,
            generations: await db.generation.findMany({
              where: { propertyId: id, userId: elite.userId },
              orderBy: { createdAt: "desc" },
              take: 20,
            }),
          };
        })();
  if (!loaded) notFound();
  const { property, generations } = loaded;

  const historial: FilaGeneracion[] = generations.map((g) => ({
    id: g.id,
    month: g.month,
    year: g.year,
    status: g.status,
    createdAt: g.createdAt,
  }));
  const nDocs = property.documents.length;

  return (
    <EmpresaShell elite={elite}>
      <style href="k-empresa-propiedad" precedence="default">{CSS_PROPIEDAD}</style>
      <Pagina>
        <Pieza className="emp-con-miga">
          <Boton variante="fantasma" tam={40} flecha="vuelve" href="/empresa/propiedades" className="emp-miga">
            Volver a propiedades
          </Boton>
          <CabeceraPieza
            nn="03"
            titulo={property.name}
            subtitulo={[property.address, property.city].filter(Boolean).join(" · ") || undefined}
            acciones={<Boton href="/dashboard/generar" flecha="avanza">Generar informe</Boton>}
          />

          <div className="emp-ficha">
            {/* Datos del mes para la generación en lote (7 columnas) */}
            <div className="emp-ficha-a">
              <MonthlyDataCard propertyId={property.id} />
            </div>

            <div className="emp-ficha-b">
              <Panel titulo="Datos de la copropiedad">
                <Resumen
                  etiquetaAccesible="Datos de la copropiedad"
                  filas={[
                    { etiqueta: "Ciudad", valor: property.city || "Sin dato" },
                    { etiqueta: "Unidades", valor: property.units ? property.units.toLocaleString("es-CO") : "Sin dato" },
                    { etiqueta: "Grupo", valor: property.groupLabel || "Sin grupo" },
                  ]}
                />
              </Panel>

              <Panel titulo="Documentos" nota={`${nDocs} ${nDocs === 1 ? "cargado" : "cargados"}`} className="emp-docs">
                {nDocs === 0 ? (
                  <p className="emp-docs-vacio">
                    Sin reglamento ni manual cargados. Puedes subirlos desde{" "}
                    <Link href="/dashboard/propiedades" className="k-enlace">Propiedades</Link>.
                  </p>
                ) : (
                  <ul className="emp-docs-l">
                    {property.documents.map((doc) => (
                      <li key={doc.id}>
                        <TipoArchivo>{tipoDeArchivo(doc.name)}</TipoArchivo>
                        <span className="nom">
                          <b>{doc.name}</b>
                          <span>{DOC_TYPE_LABELS[doc.type] || doc.type}</span>
                        </span>
                        <BotonFila href={doc.url} nuevaPestana aria-label={`Abrir ${doc.name}`}>
                          Abrir
                        </BotonFila>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>

          <Seccion id="emp-historial" titulo="Historial de generaciones" nota={
              generations.length >= 20
                ? "las 20 más recientes"
                : `${generations.length} ${generations.length === 1 ? "generación" : "generaciones"}`
            }>
            <TablaGeneraciones
              etiquetaAccesible={`Historial de generaciones de ${property.name}`}
              filas={historial}
              conEnlace
              vacio={
                <Vacio
                  nivel={3}
                  titulo="Esta propiedad aún no tiene informes generados."
                  texto="Carga sus datos del mes y inclúyela en el próximo lote, o genera su informe desde el asistente."
                />
              }
            />
          </Seccion>
        </Pieza>
      </Pagina>
    </EmpresaShell>
  );
}

const CSS_PROPIEDAD = `
.emp-con-miga { padding-top: 20px; }
.emp-miga { margin: 0 0 16px -8px; }
.emp-ficha { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: var(--g); align-items: start; margin-bottom: 56px; }
.emp-ficha-a { grid-column: 1 / 8; min-width: 0; }
.emp-ficha-b { grid-column: 8 / 13; min-width: 0; display: grid; gap: 32px; }
.emp-docs-vacio { margin: 0; font-size: 15px; line-height: 1.45; color: var(--ink-2); }
.emp-docs-l { list-style: none; margin: 0; padding: 0; }
.emp-docs-l > li { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; column-gap: 14px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.emp-docs-l > li:first-child { border-top: 1px solid var(--line); }
.emp-docs-l .nom { min-width: 0; }
.emp-docs-l .nom b { display: block; font-size: 15px; font-weight: 650; line-height: 1.3; overflow-wrap: anywhere; }
.emp-docs-l .nom span { display: block; font-size: 14px; color: var(--ink-3); }
@media (max-width: 1180px) {
  .emp-ficha-a, .emp-ficha-b { grid-column: 1 / -1; }
  .emp-ficha-b { margin-top: 40px; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--g); }
}
@media (max-width: 860px) {
  .emp-ficha { display: block; margin-bottom: 40px; }
  .emp-ficha-b { display: grid; grid-template-columns: minmax(0, 1fr); }
  .emp-docs-l > li { grid-template-columns: 52px minmax(0, 1fr); row-gap: 10px; }
  .emp-docs-l > li > .k-bt { grid-column: 1 / -1; justify-content: center; }
}
`;
