import { notFound } from "next/navigation";
import { ListaReuniones } from "@/components/reuniones/ListaReuniones";
import { sesionVeReuniones } from "@/lib/meetings/acceso";

/** Piloto: si la bandera no deja ver «Reuniones» a esta cuenta, la ruta no existe. */
export default async function PaginaReuniones() {
  if (!(await sesionVeReuniones())) notFound();
  return <ListaReuniones />;
}
