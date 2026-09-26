import { notFound } from "next/navigation";

/**
 * La muestra del kit es solo para verificar durante el rediseño y se borra antes
 * del PR (git rm de esta carpeta). Mientras tanto, en producción no existe: así un
 * merge por descuido no publica una página de prueba con datos ficticios.
 */
export default function KitMuestraLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
