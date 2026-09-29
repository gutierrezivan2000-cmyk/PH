"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import type { EliteSession } from "@/lib/elite-auth";
import { LogOut } from "lucide-react";
import { Dock, GrupoIndice, Indice, ItemIndice, MODULOS, RegionAvisos, type ClaveModulo, type DestinoDock } from "@/components/kit";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Header } from "@/components/dashboard/Header";
import { NAV_EMPRESA, esActiva, iniciales } from "@/components/dashboard/Sidebar";

/**
 * Armazón de /empresa (consola Élite multipropiedad) con la dirección «Guía»:
 * el mismo menú lateral, cabecera sticky y dock móvil que el dashboard.
 * Menú propio: Portafolio (Portafolio · Generar en lote · Propiedades)
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
  const destino = (clave: ClaveModulo, etiqueta: string, href: string, extra?: Partial<DestinoDock>): DestinoDock => {
    const m = MODULOS[clave];
    return { href, etiqueta, icono: m.icono, tono: m.tono, actual: esActiva(pathname, href), ...extra };
  };
  const nombre = elite.name || elite.email.split("@")[0];
  const plan = elite.plan === "elite" ? "Plan Élite" : elite.plan === "beta" ? "Beta · acceso completo" : "Demo";

  const pie = (
    <>
      <div className="k-yo-fila">
        <div className="k-yo" title={`${nombre} · ${elite.email} · ${plan}`}>
          <div className="k-yo-a" aria-hidden="true">{iniciales(nombre)}</div>
          <div style={{ minWidth: 0 }}>
            <b>{nombre}</b>
            <span className="plan">{plan}</span>
          </div>
        </div>
        <button type="button" className="k-salir" onClick={() => signOut({ callbackUrl: "/" })} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut aria-hidden="true" focusable="false" />
          <span>Salir</span>
        </button>
      </div>
      <ThemeToggle />
    </>
  );

  return (
    <div data-shell="app" className="k-app">
      <div className="k-col-indice">
        <Indice abierto={mobileOpen} alCerrar={cerrar} pie={pie} hrefInicio="/empresa" idPrincipal="k-principal-empresa">
          <GrupoIndice titulo="Portafolio">
            {NAV_EMPRESA.map((item) => (
              <ItemIndice key={item.href} href={item.href} actual={esActiva(pathname, item.href)} alNavegar={cerrar}
                icono={MODULOS[item.modulo].icono} tono={MODULOS[item.modulo].tono} ayuda={MODULOS[item.modulo].queHace}>
                {item.name}
              </ItemIndice>
            ))}
          </GrupoIndice>
          <GrupoIndice titulo="Mi panel">
            <ItemIndice href="/dashboard" alNavegar={cerrar} icono={MODULOS.inicio.icono} tono={MODULOS.inicio.tono}
              ayuda="Vuelve al panel de una sola copropiedad.">
              Volver a mi panel
            </ItemIndice>
          </GrupoIndice>
        </Indice>
      </div>

      <div id="k-principal-empresa" className="k-principal flex flex-col">
        <Header title={actual?.name ?? "Portafolio"} />
        <main className="flex-1 min-w-0">{children}</main>
        <Dock
          alAbrirIndice={() => setAbiertoEn(pathname)}
          indiceAbierto={mobileOpen}
          destinos={[
            destino("portafolio", "Portafolio", "/empresa"),
            // «Lote» en el dock (celdas estrechas a 390); el nombre completo, para lectores.
            destino("generarLote", "Lote", "/empresa/generar", { etiquetaAccesible: "Generar en lote" }),
            destino("propiedadesEmpresa", "Propiedades", "/empresa/propiedades"),
            { href: MODULOS.suscripcion.href, etiqueta: "Suscripción", icono: MODULOS.suscripcion.icono, tono: MODULOS.suscripcion.tono },
          ]}
        />
      </div>
      <RegionAvisos />
    </div>
  );
}
