"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/ui/demo-banner";
import { RenewalBanner } from "@/components/dashboard/RenewalBanner";
import { useState, lazy, Suspense } from "react";

const ChatBot = lazy(() => import("@/components/dashboard/ChatBot").then(m => ({ default: m.ChatBot })));

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <SessionProvider>
      <div className="flex flex-col min-h-screen bg-background relative">
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
          <main className="flex-1 min-h-screen w-full overflow-x-hidden">
            <RenewalBanner />
            {/* Mobile top bar */}
            <div
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
                    background: "linear-gradient(135deg, #7c5cff, #5a3cf0)",
                    boxShadow: "0 0 14px rgba(124,92,255,0.30)",
                  }}
                >
                  S
                </div>
                <span className="text-sm font-bold tracking-tight text-foreground">
                  SOPH<span className="text-muted-foreground/60 font-normal">.</span>
                  <span style={{ color: "#7c5cff" }}>IA</span>
                </span>
              </div>
            </div>
            {children}
          </main>
        </div>

        <Suspense fallback={null}>
          <ChatBot />
        </Suspense>
      </div>
    </SessionProvider>
  );
}
