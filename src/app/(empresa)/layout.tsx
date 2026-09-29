import "@/components/kit/fuentes";
import { EmpresaProvider } from "./EmpresaProvider";

export const metadata = {
  title: "SOPH.IA · Portafolio",
  description: "Gestión de portafolio de propiedades para empresas administradoras",
};

// data-shell="app" activa los tokens y la tipografía «Guía» (globals.css, :root:has(…)).
export default function EmpresaRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-shell="app" className="min-h-screen bg-background text-foreground">
      <EmpresaProvider>{children}</EmpresaProvider>
    </div>
  );
}
