"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Building2,
  LayoutDashboard,
  Building,
  History,
  CreditCard,
  LogOut,
  Sparkles,
  Settings,
  MessageCircle,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

const WHATSAPP_LINK = "https://wa.me/message/PLACEHOLDER";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generar", href: "/dashboard/generar", icon: Sparkles },
  { name: "Propiedades", href: "/dashboard/propiedades", icon: Building },
  { name: "Historial", href: "/dashboard/historial", icon: History },
  { name: "Suscripcion", href: "/dashboard/suscripcion", icon: CreditCard },
  { name: "Configuracion", href: "/dashboard/configuracion", icon: Settings },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ open, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col min-h-screen transition-all duration-300 ease-in-out relative group/sidebar",
          "bg-white/10 backdrop-blur-xl border-r border-white/20",
          "shadow-[0_8px_32px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.25)]",
          collapsed ? "w-[76px]" : "w-[264px]"
        )}
      >
        {/* Subtle inner highlight */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-white/5 pointer-events-none rounded-r-none" />

        {/* Logo */}
        <div className={cn(
          "relative flex items-center gap-3 h-[72px]",
          collapsed ? "px-4 justify-center" : "px-6"
        )}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-[0_4px_16px_rgba(139,92,246,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] flex-shrink-0">
            <Sparkles className="h-5 w-5 text-white drop-shadow-sm" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-lg font-extrabold bg-gradient-to-r from-violet-300 via-purple-400 to-violet-500 bg-clip-text text-transparent leading-tight drop-shadow-sm">
                SOPH.IA
              </span>
              <span className="text-[10px] font-medium text-white/50 tracking-wider uppercase">
                Gestion Inteligente
              </span>
            </div>
          )}
        </div>

        {/* Gradient divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className={cn(
            "absolute -right-3.5 top-[52px] w-7 h-7 rounded-full flex items-center justify-center z-10",
            "bg-white/15 backdrop-blur-md border border-white/30",
            "shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.2)]",
            "opacity-0 group-hover/sidebar:opacity-100 transition-all duration-200",
            "hover:bg-violet-400/20 hover:border-violet-300/40 hover:shadow-[0_4px_16px_rgba(139,92,246,0.2)]"
          )}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5 text-white/70" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5 text-white/70" />
          )}
        </button>

        {/* Nav */}
        <nav className={cn("relative flex-1 py-5 space-y-1", collapsed ? "px-2" : "px-3")}>
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                title={collapsed ? item.name : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-300 group/item",
                  collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5",
                  isActive
                    ? [
                        "bg-violet-500/20 backdrop-blur-sm text-white",
                        "border border-violet-400/30",
                        "shadow-[0_0_20px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]",
                      ]
                    : [
                        "text-white/60 border border-transparent",
                        "hover:bg-white/10 hover:backdrop-blur-sm hover:text-white/90",
                        "hover:border-white/15 hover:scale-[1.02]",
                        "hover:shadow-[0_4px_16px_rgba(255,255,255,0.06)]",
                      ]
                )}
              >
                <item.icon className={cn(
                  "h-[18px] w-[18px] flex-shrink-0 transition-all duration-300",
                  isActive
                    ? "text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.6)]"
                    : "text-white/40 group-hover/item:text-violet-300"
                )} />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Gradient divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {/* WhatsApp Support */}
        <div className={cn("relative py-2", collapsed ? "px-2" : "px-3")}>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "Soporte" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-300",
              "text-emerald-300/80 border border-transparent",
              "hover:bg-emerald-400/15 hover:backdrop-blur-sm hover:border-emerald-400/20",
              "hover:text-emerald-300 hover:scale-[1.02]",
              "hover:shadow-[0_0_16px_rgba(52,211,153,0.12)]",
              collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5"
            )}
          >
            <MessageCircle className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && <span>Soporte WhatsApp</span>}
          </a>
        </div>

        {/* Gradient divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

        {/* Logout */}
        <div className={cn("relative py-4", collapsed ? "px-2" : "px-3")}>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            title={collapsed ? "Cerrar Sesion" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl text-[13px] font-medium w-full transition-all duration-300",
              "text-white/40 border border-transparent",
              "hover:bg-red-500/15 hover:backdrop-blur-sm hover:text-red-300",
              "hover:border-red-400/20 hover:scale-[1.02]",
              "hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]",
              collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5"
            )}
          >
            <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && <span>Cerrar Sesion</span>}
          </button>
        </div>
      </aside>

      {/* Mobile overlay backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[288px] transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col",
          "bg-white/10 backdrop-blur-2xl",
          "border-r border-white/20",
          "shadow-[0_8px_48px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Subtle inner highlight */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-white/5 pointer-events-none" />

        {/* Mobile header */}
        <div className="relative flex items-center justify-between px-5 h-[72px] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-[0_4px_16px_rgba(139,92,246,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]">
              <Sparkles className="h-5 w-5 text-white drop-shadow-sm" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold bg-gradient-to-r from-violet-300 via-purple-400 to-violet-500 bg-clip-text text-transparent leading-tight drop-shadow-sm">
                SOPH.IA
              </span>
              <span className="text-[10px] font-medium text-white/50 tracking-wider uppercase">
                Gestion Inteligente
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "p-2 rounded-xl transition-all duration-200",
              "bg-white/5 border border-white/10",
              "hover:bg-white/15 hover:border-white/20",
              "active:scale-95"
            )}
          >
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* Gradient divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent flex-shrink-0" />

        {/* Mobile nav */}
        <nav className="relative flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-300",
                  isActive
                    ? [
                        "bg-violet-500/20 backdrop-blur-sm text-white",
                        "border border-violet-400/30",
                        "shadow-[0_0_20px_rgba(139,92,246,0.25),inset_0_1px_0_rgba(255,255,255,0.15)]",
                      ]
                    : [
                        "text-white/60 border border-transparent",
                        "hover:bg-white/10 hover:text-white/90",
                        "hover:border-white/15 hover:scale-[1.02]",
                        "hover:shadow-[0_4px_16px_rgba(255,255,255,0.06)]",
                      ]
                )}
              >
                <item.icon className={cn(
                  "h-[18px] w-[18px] flex-shrink-0 transition-all duration-300",
                  isActive
                    ? "text-violet-300 drop-shadow-[0_0_8px_rgba(167,139,250,0.6)]"
                    : "text-white/40"
                )} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Gradient divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent flex-shrink-0" />

        {/* Mobile WhatsApp */}
        <div className="relative px-3 py-2 flex-shrink-0">
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-300",
              "text-emerald-300/80 border border-transparent",
              "hover:bg-emerald-400/15 hover:border-emerald-400/20",
              "hover:text-emerald-300 hover:scale-[1.02]",
              "hover:shadow-[0_0_16px_rgba(52,211,153,0.12)]"
            )}
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            Soporte WhatsApp
          </a>
        </div>

        {/* Gradient divider */}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent flex-shrink-0" />

        {/* Mobile Logout */}
        <div className="relative px-3 py-4 flex-shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl text-[13px] font-medium w-full transition-all duration-300",
              "text-white/40 border border-transparent",
              "hover:bg-red-500/15 hover:text-red-300",
              "hover:border-red-400/20 hover:scale-[1.02]",
              "hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]"
            )}
          >
            <LogOut className="h-[18px] w-[18px]" />
            Cerrar Sesion
          </button>
        </div>
      </aside>
    </>
  );
}
