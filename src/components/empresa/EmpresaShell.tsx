"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import type { EliteSession } from "@/lib/elite-auth";
import { Dock, Flecha, GrupoIndice, Indice, ItemIndice, RegionAvisos } from "@/components/kit";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Header } from "@/components/dashboard/Header";
import { EstilosIndice, NAV_EMPRESA, esActiva, iniciales } from "@/components/dashboard/Sidebar";

/**
 * Armazón de /empresa (consola Élite multipropiedad) con la dirección «Índice»:
 * el mismo índice lateral, cabecera sticky y dock móvil que el dashboard.
 * Índice propio: A Portafolio (01 Portafolio · 02 Generar en lote · 03 Propiedades)
 * + «Volver a mi panel». Los datos de la cuenta salen de la sesión Élite.
 */
export function EmpresaShell({ elite, children }: { elite: EliteSession; children: React.ReactNode }) {
  const pathname = usePathname();
  // Abierto solo en la ruta donde se abrió: cualquier navegación (entrada,
  // logotipo, atrás/adelante) lo cierra sin sincronizar estado en un efecto.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null);
  const mobileOpen = abiertoEn !== null && abiertoEn === pathname;
  const cerrar = () => setAbiertoEn(null);

  const actual = NAV_EMPRESA.find((item) => esActiva(pathname, item.href));
  const nombre = elite.name || elite.email.split("@")[0];
  const plan = elite.plan === "elite" ? "Plan Élite" : elite.plan === "beta" ? "Beta · acceso completo" : "Demo";

  const pie = (
    <>
      <div className="k-yo" title={`${nombre} · ${elite.email}`}>
        <div className="k-yo-a" aria-hidden="true">{iniciales(nombre)}</div>
        <div style={{ minWidth: 0 }}>
          <b>{nombre}</b>
          <span>{elite.email}</span>
          <span className="plan">{plan}</span>
        </div>
      </div>
      <ThemeToggle />
      <button type="button" className="k-salir" onClick={() => signOut({ callbackUrl: "/" })} aria-label="Cerrar sesión">
        <span>Cerrar sesión</span>
        <Flecha />
      </button>
    </>
  );

  return (
    <div data-shell="app" className="k-app">
      <div className="k-col-indice">
        <EstilosIndice />
        <Indice abierto={mobileOpen} alCerrar={cerrar} pie={pie} hrefInicio="/empresa" idPrincipal="k-principal-empresa">
          <div className="k-idx-tit">
            <span aria-hidden="true">Índice</span>
          </div>
          <GrupoIndice letra="A" titulo="Portafolio">
            {NAV_EMPRESA.map((item) => (
              <ItemIndice key={item.href} n={item.n} href={item.href} actual={esActiva(pathname, item.href)} alNavegar={cerrar}>
                {item.name}
              </ItemIndice>
            ))}
          </GrupoIndice>
          <GrupoIndice letra="B" titulo="Mi panel">
            <ItemIndice n="—" href="/dashboard" alNavegar={cerrar}>
              Volver a mi panel
            </ItemIndice>
          </GrupoIndice>
        </Indice>
      </div>

      <div id="k-principal-empresa" className="k-principal flex flex-col">
        {/* Dock de /empresa a 14 px como el del dashboard (SPEC §f.1). «Propiedades» y
            «Suscripción» no caben en celdas de 78 px a 390 con Archivo al 100 %: al 85 % de
            ancho sí, en una línea (y «Generar en lote» va como «Lote»). */}
        <style href="k-dock-empresa" precedence="default">
          {`#k-principal-empresa > .k-dock > * { font-stretch: 85%; padding: 0 3px; }`}
        </style>
        <Header title={actual?.name ?? "Portafolio"} />
        <main className="flex-1 min-w-0">{children}</main>
        <Dock
          alAbrirIndice={() => setAbiertoEn(pathname)}
          indiceAbierto={mobileOpen}
          destinos={[
            { href: "/empresa", etiqueta: "Portafolio", actual: esActiva(pathname, "/empresa") },
            // «Lote» en el dock (celdas de 78 px a 390); el nombre completo, para lectores.
            {
              href: "/empresa/generar",
              etiqueta: "Lote",
              etiquetaAccesible: "Generar en lote",
              actual: esActiva(pathname, "/empresa/generar"),
            },
            { href: "/empresa/propiedades", etiqueta: "Propiedades", actual: esActiva(pathname, "/empresa/propiedades") },
            { href: "/dashboard/suscripcion", etiqueta: "Suscripción" },
          ]}
        />
      </div>
      <RegionAvisos />
    </div>
  );
}
