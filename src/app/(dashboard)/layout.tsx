"use client";

import { SessionProvider } from "next-auth/react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { DemoBanner } from "@/components/ui/demo-banner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex flex-col min-h-screen">
        <DemoBanner />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 bg-background min-h-screen">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}
