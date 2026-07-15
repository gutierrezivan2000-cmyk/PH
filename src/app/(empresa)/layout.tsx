import { EmpresaProvider } from "./EmpresaProvider";

export const metadata = {
  title: "SOPH.IA · Portafolio",
  description: "Gestión de portafolio de propiedades para empresas administradoras",
};

export default function EmpresaRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <EmpresaProvider>{children}</EmpresaProvider>
    </div>
  );
}
