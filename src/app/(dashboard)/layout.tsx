"use client";

import "@/components/kit/fuentes";
import dynamic from "next/dynamic";
import { SessionProvider } from "next-auth/react";
import { Sidebar, esActiva, useDatosIndice } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/ui/demo-banner";
import { RenewalBanner } from "@/components/dashboard/RenewalBanner";
import { Dock, RegionAvisos } from "@/components/kit";
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
   * suponerse. Con el armazón «Índice» la barra móvil es el dock inferior
   * (≤ 860 px: 60 px + zona segura); en escritorio no se pinta y la variable
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const datos = useDatosIndice(pathname);

  return (
    <SessionProvider>
      {/* data-shell="app" activa los tokens «Índice» (globals.css, :root:has(…)). */}
      <div data-shell="app" className="bg-background text-foreground">
        <DemoBanner />
        {/* El armazón arranca DEBAJO del banner de demo: medir la ventana entera
            (100dvh) hacía que la página midiera 100dvh + el banner y apareciera
            una barra de desplazamiento sin nada que mostrar. La variable la
            publica el propio banner midiéndose, y vale 0 cuando no lo hay. */}
        <div className="k-app" style={{ minHeight: "calc(100dvh - var(--demo-banner-h, 0px))" }}>
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            datos={datos}
          />
          <div ref={principalRef} id="k-principal" className="k-principal flex flex-col">
            <RenewalBanner />
            {/* overflow-x: clip (no hidden): recorta como antes lo que se salga de lado sin
                crear un contenedor de scroll, así la cabecera sticky sigue pegándose. */}
            <main className="flex-1 min-w-0 overflow-x-clip">{children}</main>
            {/* Dock móvil (≤ 860 px): sustituye al menú hamburguesa; «Índice» abre el índice como diálogo. */}
            <Dock
              alAbrirIndice={() => setSidebarOpen(true)}
              indiceAbierto={sidebarOpen}
              destinos={[
                { href: "/dashboard", etiqueta: "Inicio", actual: esActiva(pathname, "/dashboard") },
                {
                  href: "/dashboard/generar",
                  etiqueta: "Generar",
                  actual: esActiva(pathname, "/dashboard/generar"),
                  insignia: datos.porGenerar ? { n: datos.porGenerar, unidad: "por generar" } : undefined,
                },
                {
                  href: "/dashboard/calendario",
                  etiqueta: "Bitácora",
                  actual: esActiva(pathname, "/dashboard/calendario"),
                  insignia: datos.vencidas
                    ? { n: datos.vencidas, unidad: datos.vencidas === 1 ? "vencida" : "vencidas", alerta: true }
                    : undefined,
                },
                { href: "/dashboard/asistente", etiqueta: "Asistente", actual: esActiva(pathname, "/dashboard/asistente") },
              ]}
            />
            {/* Dos chats a la vez confunden, y el botón flotante caía justo
                encima del botón de enviar del agente. Va dentro de la columna
                principal para quedar inerte mientras el índice móvil está abierto. */}
            {!enChatDeAgente && <ChatBot />}
          </div>
        </div>
        <RegionAvisos />
      </div>
    </SessionProvider>
  );
}
