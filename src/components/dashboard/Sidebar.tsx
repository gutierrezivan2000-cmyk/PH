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
  Gavel,
  Wallet,
  PieChart,
  Users,
  MessageSquare,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { COMING_SOON, type ComingSoonKey } from "@/lib/feature-flags";

type NavEntry = {
  name: string;
  href: string;
  icon: typeof Home;
  n: string;
  badge?: string;
  /** Si la función está en COMING_SOON, el ítem muestra la insignia "Pronto". */
  comingSoon?: ComingSoonKey;
};
type NavGroup = { label: string; items: NavEntry[] };

// Grouped navigation: 15 flat entries were hard to scan. Sections mirror how
// an administrator actually thinks about their work.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Día a día",
    items: [
      { name: "Inicio", href: "/dashboard", icon: Home, n: "01" },
      { name: "Generar", href: "/dashboard/generar", icon: FilePlus2, n: "02" },
      { name: "Bitácora", href: "/dashboard/calendario", icon: CalendarClock, n: "03" },
      { name: "Asistente IA", href: "/dashboard/asistente", icon: Sparkles, n: "04", badge: "6" },
    ],
  },
  {
    label: "Finanzas",
    items: [
      { name: "Cartera", href: "/dashboard/cartera", icon: Wallet, n: "05", comingSoon: "cartera" },
      { name: "Presupuesto", href: "/dashboard/presupuesto", icon: PieChart, n: "06", comingSoon: "presupuesto" },
    ],
  },
  {
    label: "Comunidad",
    items: [
      { name: "Residentes", href: "/dashboard/residentes", icon: Users, n: "07" },
      { name: "PQRS", href: "/dashboard/pqrs", icon: MessageSquare, n: "08", comingSoon: "pqrs" },
      { name: "Comunicados", href: "/dashboard/comunicados", icon: Send, n: "09", comingSoon: "comunicados" },
      { name: "Asambleas", href: "/dashboard/asambleas", icon: Gavel, n: "10", comingSoon: "asambleas" },
      { name: "Certificados", href: "/dashboard/certificados", icon: BadgeCheck, n: "11", comingSoon: "certificados" },
    ],
  },
  {
    label: "Administración",
    items: [
      { name: "Propiedades", href: "/dashboard/propiedades", icon: Building2, n: "12" },
      { name: "Historial", href: "/dashboard/historial", icon: History, n: "13" },
      { name: "Suscripción", href: "/dashboard/suscripcion", icon: CreditCard, n: "14" },
      { name: "Configuración", href: "/dashboard/configuracion", icon: Settings2, n: "15" },
    ],
  },
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

  // Élite "Portafolio" joins the Finanzas group when available.
  const groups: NavGroup[] = NAV_GROUPS.map((g) =>
    g.label === "Finanzas" && showPortafolio
      ? { ...g, items: [PORTAFOLIO_ENTRY, ...g.items] }
      : g
  );

  const isActiveHref = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const navItem = (item: NavEntry, isActive: boolean, isMobile = false) => {
    const showLabel = isMobile || !collapsed;
    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={isMobile ? onClose : undefined}
        title={collapsed && !isMobile ? item.name : undefined}
        data-active={isActive}
        className={cn(
          "ui-nav-item group/item flex items-center gap-3 rounded-xl",
          showLabel ? "px-3 py-2" : "px-3 py-2.5 justify-center",
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        style={{
          background: isActive ? "rgba(124,92,255,0.10)" : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = "";
        }}
      >
        <item.icon
          className={cn(
            "h-[16px] w-[16px] flex-shrink-0 transition-all duration-200",
            isActive
              ? "text-[#9a7fff] scale-105"
              : "text-muted-foreground/70 group-hover/item:text-foreground group-hover/item:scale-105"
          )}
        />
        {showLabel && (
          <>
            <span className="flex-1 truncate text-[13px] font-medium">{item.name}</span>
            {item.comingSoon && COMING_SOON[item.comingSoon] ? (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-md"
                style={{
                  fontFamily: "var(--hifi-mono)",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--hifi-ink-faint)",
                  border: "1px solid var(--hifi-hairline)",
                }}
              >
                Pronto
              </span>
            ) : (
              item.badge && (
                <span
                  className="text-[9.5px] px-1.5 py-0.5 rounded-md transition-colors"
                  style={{
                    fontFamily: "var(--hifi-mono)",
                    letterSpacing: "0.06em",
                    background: isActive ? "rgba(124,92,255,0.16)" : "rgba(255,255,255,0.05)",
                    color: isActive ? "#9a7fff" : "var(--hifi-ink-faint)",
                  }}
                >
                  {item.badge}
                </span>
              )
            )}
          </>
        )}
      </Link>
    );
  };

  const renderGroups = (isMobile = false) =>
    groups.map((group, gi) => (
      <div key={group.label} className={gi > 0 ? "mt-5" : undefined}>
        {(isMobile || !collapsed) && (
          <p
            className="px-3 mb-1.5 text-[9px] font-medium select-none"
            style={{
              fontFamily: "var(--hifi-mono)",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(246,245,247,0.28)",
            }}
          >
            {group.label}
          </p>
        )}
        {collapsed && !isMobile && gi > 0 && (
          <div className="mx-3 mb-2 h-px" style={{ background: "var(--hifi-hairline)" }} />
        )}
        <div className="space-y-0.5">
          {group.items.map((item) => navItem(item, isActiveHref(item.href), isMobile))}
        </div>
      </div>
    ));

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

        {/* Nav */}
        <nav className={cn("ui-scroll flex-1 overflow-y-auto", collapsed ? "px-2 py-4" : "px-3 py-4")}>
          {renderGroups()}
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

        <nav className="ui-scroll flex-1 px-3 py-4 overflow-y-auto">{renderGroups(true)}</nav>

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
