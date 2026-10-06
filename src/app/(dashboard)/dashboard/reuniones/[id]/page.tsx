import { notFound, redirect } from "next/navigation";
import { DetalleReunion } from "@/components/reuniones/DetalleReunion";
import { sesionVeReuniones } from "@/lib/meetings/acceso";

/** /dashboard/reuniones/[id] (el enlace viejo con ?modo=grabar lleva a la grabadora). */
export default async function PaginaReunion({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modo?: string }>;
}) {
  if (!(await sesionVeReuniones())) notFound();
  const { id } = await params;
  const { modo } = await searchParams;
  if (modo === "grabar") redirect(`/dashboard/reuniones/${encodeURIComponent(id)}/grabar`);
  return <DetalleReunion id={id} />;
}
