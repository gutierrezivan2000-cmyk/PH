"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Button } from "@/components/ui/button";
import { AGENTS, AGENT_IDS, INCLUDED_AGENT_IDS } from "@/lib/agents";
import {
  FileText,
  Building,
  History,
  Sparkles,
  ArrowRight,
  Loader2,
  CreditCard,
  Settings,
  Zap,
  Bot,
  ChevronRight,
  Lock,
} from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(!IS_DEMO);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (IS_DEMO) return;
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) throw new Error("Profile fetch failed");
        return r.json();
      })
      .then((data) => {
        if (data.onboarded === false && !data.error) {
          router.replace("/dashboard/onboarding");
        } else {
          if (data.name) setUserName(data.name.split(" ")[0]);
          setChecking(false);
        }
      })
      .catch(() => {
        setChecking(false);
      });
  }, [router]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const primaryActions = [
    {
      href: "/dashboard/generar",
      icon: FileText,
      title: "Generar Documentos",
      subtitle: "Informe, Acta y Presentacion",
      gradient: "from-violet-500 to-purple-500",
      iconBg: "bg-violet-500/15",
      iconColor: "text-violet-600 dark:text-violet-400",
    },
    {
      href: "/dashboard/asistente",
      icon: Bot,
      title: "Asistentes IA",
      subtitle: "7 agentes especializados",
      gradient: "from-fuchsia-500 to-pink-500",
      iconBg: "bg-fuchsia-500/15",
      iconColor: "text-fuchsia-600 dark:text-fuchsia-400",
    },
    {
      href: "/dashboard/propiedades",
      icon: Building,
      title: "Mis Propiedades",
      subtitle: "Gestionar copropiedades",
      gradient: "from-emerald-500 to-teal-500",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      href: "/dashboard/historial",
      icon: History,
      title: "Historial",
      subtitle: "Tus documentos generados",
      gradient: "from-blue-500 to-indigo-500",
      iconBg: "bg-blue-500/15",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
  ];

  const secondaryActions = [
    { href: "/dashboard/suscripcion", icon: CreditCard, label: "Mi suscripcion" },
    { href: "/dashboard/configuracion", icon: Settings, label: "Configuracion" },
  ];

  return (
    <div>
      <Header title="Dashboard" subtitle="Bienvenido a tu panel de gestion" />
      <div className="px-4 sm:px-6 lg:p-10 py-6 lg:py-10 space-y-8 sm:space-y-10 max-w-7xl mx-auto">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-[2rem] shadow-2xl shadow-violet-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-32 -right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-orb" />
            <div className="absolute -bottom-24 -left-20 w-80 h-80 bg-fuchsia-300/20 rounded-full blur-3xl animate-orb-delayed" />
            <div className="absolute top-1/2 right-1/3 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent_60%)]" />

          <div className="relative p-5 sm:p-8 lg:p-12">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold text-white border border-white/20 flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    IA Avanzada para PH
                  </div>
                </div>
                <h1 className="text-3xl lg:text-5xl font-bold text-white mb-4 leading-tight tracking-tight">
                  {userName ? `Hola, ${userName}` : "Bienvenido a SOPH.IA"}
                </h1>
                <p className="text-violet-100/90 text-base lg:text-lg max-w-xl leading-relaxed">
                  Tu plataforma completa para administrar Propiedad Horizontal. Genera documentos, consulta a agentes especializados y gestiona tus copropiedades.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 flex-shrink-0">
                <Link href="/dashboard/generar">
                  <Button className="bg-white text-violet-700 hover:bg-violet-50 shadow-xl shadow-black/10 gap-2 h-12 px-6 text-sm font-semibold rounded-2xl w-full sm:w-auto lg:w-full">
                    <Sparkles className="h-4 w-4" />
                    Nueva Generacion
                  </Button>
                </Link>
                <Link href="/dashboard/asistente">
                  <Button variant="outline" className="bg-white/10 backdrop-blur-md border-white/30 text-white hover:bg-white/20 hover:text-white gap-2 h-12 px-6 text-sm font-semibold rounded-2xl w-full sm:w-auto lg:w-full">
                    <Bot className="h-4 w-4" />
                    Chatear con IA
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Primary quick actions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Accesos Directos</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {primaryActions.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="group relative bg-white dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-5 hover:border-transparent hover:shadow-2xl hover:shadow-violet-500/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
                  <div className="relative">
                    <div className={`w-12 h-12 rounded-2xl ${item.iconBg} group-hover:bg-white/20 flex items-center justify-center mb-4 transition-all`}>
                      <item.icon className={`h-6 w-6 ${item.iconColor} group-hover:text-white transition-colors`} />
                    </div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white group-hover:text-white transition-colors">
                      {item.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-white/80 mt-1 transition-colors">
                      {item.subtitle}
                    </p>
                    <ArrowRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-white mt-4 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Agents showcase */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Tus Asistentes IA</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Agentes especializados listos para ayudarte</p>
            </div>
            <Link
              href="/dashboard/asistente"
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 flex items-center gap-1"
            >
              Ver todos <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {AGENT_IDS.map((id) => {
              const agent = AGENTS[id];
              const included = INCLUDED_AGENT_IDS.includes(id);
              if (included) {
                return (
                  <Link key={id} href={`/dashboard/asistente/${id}`}>
                    <div className="group relative bg-white dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-4 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 h-full cursor-pointer overflow-hidden">
                      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${agent.gradient}`} />
                      <div className={`w-10 h-10 rounded-xl ${agent.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <agent.icon className={`h-5 w-5 ${agent.color}`} />
                      </div>
                      <h3 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {agent.name}
                      </h3>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-snug">
                        {agent.title}
                      </p>
                    </div>
                  </Link>
                );
              }
              return (
                <div key={id} className="relative bg-white dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-4 h-full overflow-hidden opacity-50 cursor-not-allowed select-none">
                  <div className={`absolute inset-x-0 top-0 h-0.5 bg-gray-200 dark:bg-white/10`} />
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Lock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  </div>
                  <div className={`w-10 h-10 rounded-xl ${agent.bg} flex items-center justify-center mb-3`}>
                    <agent.icon className={`h-5 w-5 ${agent.color}`} />
                  </div>
                  <h3 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                    {agent.name}
                  </h3>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2 leading-snug">
                    {agent.title}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Usage + Quick links */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageCard />
          </div>
          <div className="bg-white dark:bg-white/[0.04] backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-3xl p-6">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4 text-sm">Mi Cuenta</h3>
            <div className="space-y-2">
              {secondaryActions.map((item) => (
                <Link key={item.href} href={item.href}>
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-left transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 flex-1">
                      {item.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
