"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Home,
  Building2,
  History,
  CreditCard,
  LogOut,
  FilePlus2,
  Settings2,
  ChevronsLeft,
  ChevronsRight,
  X,
  Sparkles,
  LayoutGrid,
  CalendarClock,
  Send,
  BadgeCheck,
} from "lucide-react";
import { signOut } from "next-auth/react";

type NavEntry = { name: string; href: string; icon: typeof Home; n: string; badge?: string };

const navigation: NavEntry[] = [
  { name: "Inicio", href: "/dashboard", icon: Home, n: "01" },
  { name: "Generar", href: "/dashboard/generar", icon: FilePlus2, n: "02" },
  { name: "Calendario", href: "/dashboard/calendario", icon: CalendarClock, n: "03" },
  { name: "Comunicados", href: "/dashboard/comunicados", icon: Send, n: "04" },
  { name: "Certificados", href: "/dashboard/certificados", icon: BadgeCheck, n: "05" },
  { name: "Asistente IA", href: "/dashboard/asistente", icon: Sparkles, n: "06", badge: "6" },
  { name: "Propiedades", href: "/dashboard/propiedades", icon: Building2, n: "07" },
  { name: "Historial", href: "/dashboard/historial", icon: History, n: "08" },
  { name: "Suscripción", href: "/dashboard/suscripcion", icon: CreditCard, n: "09" },
  { name: "Configuración", href: "/dashboard/configuracion", icon: Settings2, n: "10" },
];

// Enterprise "Portafolio" — only for Elite subscribers and beta testers.
const PORTAFOLIO_ENTRY: NavEntry = {
  name: "Portafolio",
  href: "/empresa",
  icon: LayoutGrid,
  n: "★",
  badge: "Élite",
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function BrandMark({ collapsed = false }: { collapsed?: boolean }) {
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
      {!collapsed && (
        <span className="text-[15px] font-bold tracking-tight text-foreground">
          SOPH<span className="text-muted-foreground/60 font-normal">.</span>
          <span style={{ color: "#7c5cff" }}>IA</span>
        </span>
      )}
    </div>
  );
}

export function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  // Show the enterprise "Portafolio" entry only for Elite / beta users.
  const [showPortafolio, setShowPortafolio] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d && (d.planName === "elite" || d.planStatus === "beta")) {
          setShowPortafolio(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const navItems: NavEntry[] = showPortafolio
    ? [...navigation.slice(0, 4), PORTAFOLIO_ENTRY, ...navigation.slice(4)]
    : navigation;

  const navItem = (item: typeof navigation[0], isActive: boolean, isMobile = false) => {
    const showLabel = isMobile || !collapsed;
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={isMobile ? onClose : undefined}
        title={collapsed && !isMobile ? item.name : undefined}
        className={cn(
          "group/item flex items-center gap-3 rounded-xl border transition-all duration-200",
          showLabel ? "px-3 py-2.5" : "px-3 py-3 justify-center",
          isActive
            ? "bg-[rgba(124,92,255,0.08)] border-[rgba(124,92,255,0.40)] text-foreground"
            : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
        style={
          isActive
            ? { boxShadow: "inset 2px 0 0 #7c5cff" }
            : undefined
        }
      >
        <item.icon
          className={cn(
            "h-[16px] w-[16px] flex-shrink-0 transition-colors duration-200",
            isActive ? "text-[#7c5cff]" : "text-muted-foreground/80 group-hover/item:text-foreground"
          )}
        />
        {showLabel && (
          <>
            <span className="flex-1 truncate text-[13px] font-medium">{item.name}</span>
            {item.badge && (
              <span
                className="text-[9.5px] font-mono px-1.5 py-0.5 rounded text-muted-foreground"
                style={{
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.06em",
                  background: isActive ? "rgba(124,92,255,0.10)" : "var(--secondary)",
                  color: isActive ? "#9a7fff" : undefined,
                }}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col min-h-screen sticky top-0 transition-all duration-300 ease-in-out relative group/sidebar",
          "bg-background border-r border-border",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex items-center h-[72px] border-b border-border",
            collapsed ? "justify-center px-3" : "px-5"
          )}
        >
          <BrandMark collapsed={collapsed} />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-[56px] w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center opacity-0 group-hover/sidebar:opacity-100 transition-all duration-200 hover:border-[#7c5cff]/40 z-10"
        >
          {collapsed ? (
            <ChevronsRight className="h-3 w-3 text-muted-foreground" />
          ) : (
            <ChevronsLeft className="h-3 w-3 text-muted-foreground" />
          )}
        </button>

        {/* Workspace label */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-2">
            <p
              className="text-[9.5px] font-medium text-muted-foreground/70 uppercase"
              style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
            >
              Workspace
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className={cn("flex-1 space-y-1 overflow-y-auto", collapsed ? "px-2 py-3" : "px-3 pb-4")}>
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return navItem(item, isActive);
          })}
        </nav>

        {/* Logout */}
        <div className={cn("py-3 border-t border-border", collapsed ? "px-2" : "px-3")}>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-[#ff6f6f] hover:bg-[#ff6f6f]/10 w-full transition-all duration-200",
              collapsed ? "px-3 py-3 justify-center" : "px-3 py-2.5"
            )}
          >
            <LogOut className="h-[16px] w-[16px] flex-shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[280px] bg-background border-r border-border transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 h-[72px] border-b border-border flex-shrink-0">
          <BrandMark />
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Cerrar menú"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-4 pt-4 pb-2">
          <p
            className="text-[9.5px] font-medium text-muted-foreground/70 uppercase"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
          >
            Workspace
          </p>
        </div>

        <nav className="flex-1 px-3 pb-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return navItem(item, isActive, true);
          })}
        </nav>

        <div className="px-3 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:text-[#ff6f6f] hover:bg-[#ff6f6f]/10 w-full transition-all duration-200"
          >
            <LogOut className="h-[16px] w-[16px]" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
