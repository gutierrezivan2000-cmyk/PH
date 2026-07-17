"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Ticket,
  Plug,
  BarChart3,
  Activity,
  ScrollText,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminShellProps {
  admin: { userId: string; email: string; name: string | null };
  children: React.ReactNode;
}

const NAV = [
  { name: "Resumen", href: "/admin", icon: LayoutDashboard, n: "00" },
  { name: "Usuarios", href: "/admin/usuarios", icon: Users, n: "01" },
  { name: "Suscripciones", href: "/admin/suscripciones", icon: CreditCard, n: "02" },
  { name: "Tickets", href: "/admin/tickets", icon: Ticket, n: "03" },
  { name: "Add-ons", href: "/admin/addons", icon: Plug, n: "04" },
  { name: "Métricas", href: "/admin/metricas", icon: BarChart3, n: "05" },
  { name: "Consumo IA", href: "/admin/consumo", icon: Activity, n: "06" },
  { name: "Auditoría", href: "/admin/auditoria", icon: ScrollText, n: "07" },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, #7c5cff, #5a3cf0)",
          boxShadow: "0 0 18px rgba(124,92,255,0.30)",
        }}
      >
        S
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          SOPH<span className="text-muted-foreground/60 font-normal">.</span>
          <span style={{ color: "#7c5cff" }}>IA</span>
        </span>
        <span
          className="text-[9px] uppercase text-muted-foreground/70"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.18em" }}
        >
          Admin Console
        </span>
      </div>
    </div>
  );
}

export function AdminShell({ admin, children }: AdminShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const NavItem = ({ item, isMobile = false }: { item: typeof NAV[0]; isMobile?: boolean }) => {
    const isActive =
      pathname === item.href ||
      (item.href !== "/admin" && pathname.startsWith(item.href));
    return (
      <Link
        href={item.href}
        onClick={isMobile ? () => setMobileOpen(false) : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-200",
          isActive
            ? "bg-[rgba(124,92,255,0.08)] border-[rgba(124,92,255,0.40)] text-foreground"
            : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
        style={isActive ? { boxShadow: "inset 2px 0 0 #7c5cff" } : undefined}
      >
        <span
          className="text-[9.5px] w-6"
          style={{
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.14em",
            color: isActive ? "#9a7fff" : "rgba(255,255,255,0.30)",
          }}
        >
          {item.n}
        </span>
        <item.icon
          className={cn(
            "h-[15px] w-[15px] flex-shrink-0",
            isActive ? "text-[#7c5cff]" : "text-muted-foreground/80"
          )}
        />
        <span className="flex-1 truncate text-[13px] font-medium">{item.name}</span>
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] sticky top-0 h-screen border-r border-border bg-background">
        <div className="flex items-center h-[72px] px-5 border-b border-border">
          <BrandMark />
        </div>

        <div className="px-4 pt-4 pb-2">
          <p
            className="text-[9.5px] font-medium text-muted-foreground/70 uppercase"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
          >
            Operaciones
          </p>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {NAV.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
        </nav>

        {/* Account */}
        <div className="border-t border-border p-3 space-y-2">
          <div
            className="rounded-xl border border-border bg-card px-3 py-2.5"
            style={{
              background:
                "radial-gradient(120% 100% at 0% 0%, rgba(124,92,255,0.08), transparent 70%), var(--card)",
            }}
          >
            <p
              className="text-[9px] uppercase text-muted-foreground/70"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
            >
              Sesión admin
            </p>
            <p className="text-[12.5px] font-medium text-foreground mt-1 truncate">
              {admin.name || admin.email.split("@")[0]}
            </p>
            <p
              className="text-[10px] text-muted-foreground/70 truncate"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {admin.email}
            </p>
          </div>

          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-[#ff6f6f] hover:bg-[#ff6f6f]/10 w-full transition-all duration-200"
          >
            <LogOut className="h-[15px] w-[15px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[280px] bg-background border-r border-border transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-[72px] px-5 border-b border-border">
          <BrandMark />
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <NavItem key={item.href} item={item} isMobile />
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-[#ff6f6f] hover:bg-[#ff6f6f]/10 w-full transition-all duration-200"
          >
            <LogOut className="h-[15px] w-[15px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div
          className="lg:hidden sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl"
          style={{ WebkitBackdropFilter: "blur(20px)" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5 text-foreground" />
          </button>
          <BrandMark />
        </div>
        {children}
      </main>
    </div>
  );
}
