import { notFound } from "next/navigation";
import { NuevaReunion, type ModoRegistro } from "@/components/reuniones/NuevaReunion";
import { sesionVeReuniones } from "@/lib/meetings/acceso";

/** /dashboard/reuniones/nueva?modo=grabar|subir&p=<copropiedad> */
export default async function PaginaNuevaReunion({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; p?: string }>;
}) {
  if (!(await sesionVeReuniones())) notFound();
  const { modo, p } = await searchParams;
  const modoInicial: ModoRegistro = modo === "subir" ? "subir" : "grabar";
  return <NuevaReunion modoInicial={modoInicial} propiedadInicial={p} />;
}
