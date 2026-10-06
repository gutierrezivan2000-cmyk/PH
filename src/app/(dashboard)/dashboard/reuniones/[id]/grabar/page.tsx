import { notFound } from "next/navigation";
import { Grabadora } from "@/components/reuniones/Grabadora";
import { sesionVeReuniones } from "@/lib/meetings/acceso";

/** /dashboard/reuniones/[id]/grabar: la grabadora de la reunión (solo quien ve Reuniones). */
export default async function PaginaGrabar({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sesionVeReuniones())) notFound();
  const { id } = await params;
  return <Grabadora key={id} id={id} />;
}
