"use client";

import "@/components/kit/fuentes";
import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import { Sidebar, esActiva } from "@/components/dashboard/Sidebar";
import { useDatosIndice } from "@/components/dashboard/datosIndice";
import { DemoBanner } from "@/components/dashboard/DemoBanner";
import { RenewalBanner } from "@/components/dashboard/RenewalBanner";
import { Dock, MODULOS, RegionAvisos, type ClaveModulo, type DestinoDock } from "@/components/kit";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Widget flotante solo de cliente: con lazy + Suspense se prerenderizaba en el
// servidor y daba un error de hidratación intermitente.
const ChatBot = dynamic(() => import("@/components/dashboard/ChatBot").then((m) => m.ChatBot), { ssr: false });

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const principalRef = useRef<HTMLDivElement>(null);

  /**
   * Publica en `--topbar-h` el alto real de la barra móvil del armazón.
   *
   * El chat del agente ocupa el alto exacto de la ventana menos las barras que
   * lo rodean. Ese descuento estaba escrito a mano como «52px», pero la barra
   * medía 61: sobraban nueve píxeles de desplazamiento muerto y el chat
   * rebotaba al escribir. Igual que con el banner de demo, se mide en vez de
   * suponerse. Con el armazón «Guía» la barra móvil es el dock inferior
   * (≤ 860 px: 68 px + zona segura); en escritorio no se pinta y la variable
   * queda en 0.
   */
  useEffect(() => {
    const el = principalRef.current?.querySelector<HTMLElement>(":scope > .k-dock") ?? null;
    const publicar = () => {
      const alto = el ? Math.round(el.getBoundingClientRect().height) : 0;
      document.documentElement.style.setProperty("--topbar-h", `${alto}px`);
    };
    publicar();
    if (!el) return;
    const ro = new ResizeObserver(publicar);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--topbar-h");
    };
  }, [pathname]);
  const enChatDeAgente = /^\/dashboard\/asistente\/[^/]+$/.test(pathname || "");
  // El menú móvil queda abierto solo en la ruta donde se abrió: cualquier
  // navegación (una entrada, el logotipo, atrás/adelante del navegador) lo cierra
  // sin un efecto que sincronice estado.
  const [indiceAbiertoEn, setIndiceAbiertoEn] = useState<string | null>(null);
  const sidebarOpen = indiceAbiertoEn !== null && indiceAbiertoEn === pathname;
  const abrirIndice = () => setIndiceAbiertoEn(pathname);
  const cerrarIndice = () => setIndiceAbiertoEn(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const datos = useDatosIndice(pathname);
  // Cada acceso del dock lleva el icono y el color de su función (los mismos del menú).
  const destino = (clave: ClaveModulo, etiqueta: string, extra?: Partial<DestinoDock>): DestinoDock => {
    const m = MODULOS[clave];
    return { href: m.href, etiqueta, icono: m.icono, tono: m.tono, actual: esActiva(pathname, m.href), ...extra };
  };

  return (
    <SessionProvider>
      {/* data-shell="app" activa los tokens «Guía» (globals.css, :root:has(…)). */}
      <div data-shell="app" className="bg-background text-foreground">
        <DemoBanner />
        {/* El armazón arranca DEBAJO del banner de demo: medir la ventana entera
            (100dvh) hacía que la página midiera 100dvh + el banner y apareciera
            una barra de desplazamiento sin nada que mostrar. La variable la
            publica el propio banner midiéndose, y vale 0 cuando no lo hay. */}
        <div className="k-app" style={{ minHeight: "calc(100dvh - var(--demo-banner-h, 0px))" }}>
          <Sidebar
            open={sidebarOpen}
            onClose={cerrarIndice}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            datos={datos}
          />
          <div ref={principalRef} id="k-principal" className="k-principal flex flex-col">
            <RenewalBanner />
            {/* overflow-x: clip (no hidden): recorta como antes lo que se salga de lado sin
                crear un contenedor de scroll, así la cabecera sticky sigue pegándose. */}
            <main className="flex-1 min-w-0 overflow-x-clip">{children}</main>
            {/* Dock móvil (≤ 860 px): sustituye al menú hamburguesa; «Menú» abre el menú como diálogo. */}
            <Dock
              alAbrirIndice={abrirIndice}
              indiceAbierto={sidebarOpen}
              destinos={[
                destino("inicio", "Inicio"),
                destino("generar", "Generar", {
                  insignia: datos.porGenerar ? { n: datos.porGenerar, unidad: "por generar" } : undefined,
                }),
                destino("bitacora", "Bitácora", {
                  insignia: datos.vencidas
                    ? { n: datos.vencidas, unidad: datos.vencidas === 1 ? "vencida" : "vencidas", alerta: true }
                    : undefined,
                }),
                destino("asistente", "Asistente"),
              ]}
            />
            {/* Panel del chat de soporte: se abre desde «Ayuda y soporte» en el menú (sin
                botón flotante). En el chat de un agente no se monta: dos chats a la
                vez confunden. Va dentro de la columna principal para quedar inerte
                mientras el menú móvil está abierto. */}
            {!enChatDeAgente && <ChatBot />}
          </div>
        </div>
        <RegionAvisos />
      </div>
    </SessionProvider>
  );
}
