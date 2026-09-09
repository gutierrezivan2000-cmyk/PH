"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/ui/demo-banner";
import { RenewalBanner } from "@/components/dashboard/RenewalBanner";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { usePathname } from "next/navigation";

const ChatBot = lazy(() => import("@/components/dashboard/ChatBot").then(m => ({ default: m.ChatBot })));

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const barraMovilRef = useRef<HTMLDivElement>(null);

  /**
   * Publica el alto real de la barra superior móvil en `--topbar-h`.
   *
   * El chat del agente ocupa el alto exacto de la ventana menos las barras que
   * tiene encima. Ese descuento estaba escrito a mano como «52px», pero la
   * barra mide 61: sobraban nueve píxeles de desplazamiento muerto y el chat
   * rebotaba al escribir. Igual que con el banner de demo, se mide en vez de
   * suponerse. En escritorio la barra no se pinta y la variable queda en 0.
   */
  useEffect(() => {
    const el = barraMovilRef.current;
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

  return (
    <SessionProvider>
      {/* `min-h-screen` aquí y en <main> medía la ventana ENTERA, pero ambos
          arrancan debajo del banner de demo: la página acababa midiendo
          100vh + el alto del banner y aparecía una barra de desplazamiento
          vertical de treinta y pico píxeles sin nada que mostrar. La variable
          la publica el propio banner midiéndose, y vale 0 cuando no lo hay. */}
      <div className="flex flex-col min-h-[calc(100dvh-var(--demo-banner-h,0px))] bg-background relative">
        <DemoBanner />
        <div className="flex flex-1 relative">
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <main className="flex-1 min-h-[calc(100dvh-var(--demo-banner-h,0px))] w-full overflow-x-hidden">
            <RenewalBanner />
            {/* Mobile top bar */}
            <div
              ref={barraMovilRef}
              className="lg:hidden sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl"
              style={{ WebkitBackdropFilter: "blur(20px)" }}
            >
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg hover:bg-secondary transition-colors"
                aria-label="Abrir menú"
              >
                <svg
                  className="h-5 w-5 text-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div className="flex items-center gap-2.5">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-lo))",
                    boxShadow: "0 0 14px rgb(var(--accent-rgb) / 0.3)",
                  }}
                >
                  S
                </div>
                <span className="text-sm font-bold tracking-tight text-foreground">
                  SOPH<span className="text-muted-foreground/60 font-normal">.</span>
                  <span style={{ color: "var(--accent-text)" }}>IA</span>
                </span>
              </div>
            </div>
            {children}
          </main>
        </div>

        <Suspense fallback={null}>
          {/* Dos chats a la vez confunden, y el botón flotante caía justo
              encima del botón de enviar del agente. */}
          {!enChatDeAgente && <ChatBot />}
        </Suspense>
      </div>
    </SessionProvider>
  );
}
