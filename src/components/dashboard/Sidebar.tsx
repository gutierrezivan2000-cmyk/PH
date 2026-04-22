"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
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
  Bot,
} from "lucide-react";
import { signOut } from "next-auth/react";

const WHATSAPP_LINK = "https://wa.me/message/PLACEHOLDER";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Generar", href: "/dashboard/generar", icon: Sparkles },
  { name: "Asistente IA", href: "/dashboard/asistente", icon: Bot },
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

  const navItem = (item: typeof navigation[0], isActive: boolean, isMobile = false) => (
    <Link
      key={item.name}
      href={item.href}
      onClick={isMobile ? onClose : undefined}
      title={collapsed && !isMobile ? item.name : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl text-[13px] font-medium transition-all duration-200 group/item",
        isMobile || !collapsed ? "px-3.5 py-2.5" : "px-3 py-3 justify-center",
        isActive
          ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/25"
          : "text-gray-600 dark:text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300"
      )}
    >
      <item.icon className={cn(
        "h-[18px] w-[18px] flex-shrink-0 transition-colors duration-200",
        isActive ? "text-white" : "text-gray-400 dark:text-gray-500 group-hover/item:text-violet-500 dark:group-hover/item:text-violet-400"
      )} />
      {(isMobile || !collapsed) && <span className="truncate">{item.name}</span>}
    </Link>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col min-h-screen transition-all duration-300 ease-in-out relative group/sidebar",
          "bg-white dark:bg-[#12141f]/80 dark:backdrop-blur-xl border-r border-gray-200 dark:border-white/10",
          "shadow-lg shadow-violet-100/10 dark:shadow-black/20",
          collapsed ? "w-[76px]" : "w-[264px]"
        )}
      >
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 h-[72px] border-b border-gray-100/80 dark:border-white/10",
          collapsed ? "px-4 justify-center" : "px-6"
        )}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/25 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-lg font-extrabold bg-gradient-to-r from-violet-700 to-purple-600 bg-clip-text text-transparent leading-tight">
                SOPH.IA
              </span>
              <span className="text-[10px] font-medium text-gray-400 tracking-wider uppercase">
                Gestion Inteligente
              </span>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3.5 top-[52px] w-7 h-7 rounded-full bg-white dark:bg-[#1e2030] border border-gray-200 dark:border-white/10 shadow-md flex items-center justify-center opacity-0 group-hover/sidebar:opacity-100 transition-all duration-200 hover:bg-violet-50 dark:hover:bg-violet-500/10 hover:border-violet-200 dark:hover:border-violet-400/30 z-10"
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5 text-gray-500" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5 text-gray-500" />
          )}
        </button>

        {/* Nav */}
        <nav className={cn("flex-1 py-5 space-y-1", collapsed ? "px-2" : "px-3")}>
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return navItem(item, isActive);
          })}
        </nav>

        {/* WhatsApp */}
        <div className={cn("py-2", collapsed ? "px-2" : "px-3")}>
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "Soporte" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-2xl text-[13px] font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200",
              collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5"
            )}
          >
            <MessageCircle className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && <span>Soporte WhatsApp</span>}
          </a>
        </div>

        {/* Logout */}
        <div className={cn("py-4 border-t border-gray-100/80 dark:border-white/10", collapsed ? "px-2" : "px-3")}>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            title={collapsed ? "Cerrar Sesion" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-2xl text-[13px] font-medium text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 w-full transition-all duration-200",
              collapsed ? "px-3 py-3 justify-center" : "px-3.5 py-2.5"
            )}
          >
            <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
            {!collapsed && <span>Cerrar Sesion</span>}
          </button>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-[288px] bg-white dark:bg-[#12141f]/95 dark:backdrop-blur-2xl shadow-2xl shadow-black/10 border-r border-gray-200 dark:border-white/10 transform transition-transform duration-300 ease-in-out lg:hidden flex flex-col",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile header */}
        <div className="flex items-center justify-between px-5 h-[72px] border-b border-gray-100/80 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-extrabold bg-gradient-to-r from-violet-700 to-purple-600 bg-clip-text text-transparent leading-tight">
                SOPH.IA
              </span>
              <span className="text-[10px] font-medium text-gray-400 tracking-wider uppercase">
                Gestion Inteligente
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 active:bg-gray-200 dark:active:bg-white/15 transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Mobile nav */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return navItem(item, isActive, true);
          })}
        </nav>

        {/* Mobile WhatsApp */}
        <div className="px-3 py-2 flex-shrink-0">
          <a
            href={WHATSAPP_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-medium text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all duration-200"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            Soporte WhatsApp
          </a>
        </div>

        {/* Mobile Logout */}
        <div className="px-3 py-4 border-t border-gray-100/80 dark:border-white/10 flex-shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-[13px] font-medium text-gray-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 w-full transition-all duration-200"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Cerrar Sesion
          </button>
        </div>
      </aside>
    </>
  );
}
