import { notFound } from "next/navigation";
import { DetalleReunion } from "@/components/reuniones/DetalleReunion";
import { sesionVeReuniones } from "@/lib/meetings/acceso";

/** /dashboard/reuniones/[id]?modo=grabar|subir (el modo solo orienta el mensaje de un borrador). */
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
  return <DetalleReunion id={id} modo={modo === "grabar" || modo === "subir" ? modo : null} />;
}
