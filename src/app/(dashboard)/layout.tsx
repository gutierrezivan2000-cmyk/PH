"use client";

import { useState, useCallback } from "react";
import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/ui/demo-banner";
import { SidebarContext } from "@/components/dashboard/sidebar-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggle = useCallback(() => setSidebarOpen((v) => !v), []);
  const close = useCallback(() => setSidebarOpen(false), []);

  return (
    <SessionProvider>
      <SidebarContext.Provider value={{ toggle }}>
        <div className="flex flex-col min-h-screen">
          <DemoBanner />
          <div className="flex flex-1">
            <Sidebar open={sidebarOpen} onClose={close} />
            <main className="flex-1 bg-background min-h-screen min-w-0">{children}</main>
          </div>
        </div>
      </SidebarContext.Provider>
    </SessionProvider>
  );
}
