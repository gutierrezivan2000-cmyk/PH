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

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col w-[260px] bg-white border-r border-border/50 min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-6 py-5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center shadow-md shadow-primary/20">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-foreground">PH Gestion</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", isActive && "text-primary")} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* WhatsApp Support */}
      <div className="px-3 py-2">
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-700 hover:bg-emerald-50 transition-all duration-200"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
          Soporte
        </a>
      </div>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-border/50">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-red-50 hover:text-red-600 w-full transition-all duration-200"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Cerrar Sesion
        </button>
      </div>
    </div>
  );
}
