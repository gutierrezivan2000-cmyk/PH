"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/ui/demo-banner";
import { useState } from "react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <SessionProvider>
      <div className="flex flex-col min-h-screen bg-gray-50/30">
        <DemoBanner />
        <div className="flex flex-1 relative">
          <Sidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          {/* Mobile overlay */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <main className="flex-1 min-h-screen w-full overflow-x-hidden">
            {/* Mobile header toggle */}
            <div className="lg:hidden sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-gray-200/50 px-4 py-3.5 flex items-center gap-3 shadow-sm">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
                aria-label="Abrir menu"
              >
                <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-md shadow-violet-500/20">
                  <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <span className="text-sm font-extrabold bg-gradient-to-r from-violet-700 to-purple-600 bg-clip-text text-transparent">
                  SOPH.IA
                </span>
              </div>
            </div>
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
