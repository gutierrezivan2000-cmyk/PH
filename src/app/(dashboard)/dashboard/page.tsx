"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Button } from "@/components/ui/button";
import { FileText, Building, History, Sparkles, ArrowRight, Loader2, CreditCard, Settings, Zap } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(!IS_DEMO);

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

  const quickActions = [
    {
      href: "/dashboard/generar",
      icon: FileText,
      title: "Generar Documentos",
      subtitle: "Informe, Acta y PPTX",
      gradient: "from-violet-500 to-purple-500",
      shadow: "shadow-violet-500/20",
      bgHover: "hover:shadow-violet-200/40",
    },
    {
      href: "/dashboard/propiedades",
      icon: Building,
      title: "Mis Propiedades",
      subtitle: "Gestionar copropiedades",
      gradient: "from-emerald-500 to-teal-500",
      shadow: "shadow-emerald-500/20",
      bgHover: "hover:shadow-emerald-200/40",
    },
    {
      href: "/dashboard/historial",
      icon: History,
      title: "Historial",
      subtitle: "Documentos generados",
      gradient: "from-purple-500 to-pink-500",
      shadow: "shadow-purple-500/20",
      bgHover: "hover:shadow-purple-200/40",
    },
    {
      href: "/dashboard/suscripcion",
      icon: CreditCard,
      title: "Suscripcion",
      subtitle: "Gestionar tu plan",
      gradient: "from-amber-500 to-orange-500",
      shadow: "shadow-amber-500/20",
      bgHover: "hover:shadow-amber-200/40",
    },
  ];

  return (
    <div>
      <Header title="Dashboard" subtitle="Bienvenido a tu panel de gestion" />
      <div className="p-6 lg:p-10 space-y-8 max-w-7xl mx-auto">

        {/* Hero CTA */}
        <div className="relative overflow-hidden rounded-3xl shadow-2xl shadow-violet-500/20">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700" />
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 -right-32 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-orb" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-300/10 rounded-full blur-2xl animate-orb-delayed" />
          </div>
          {/* Glass overlay */}
          <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px]" />

          <div className="relative p-8 lg:p-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="px-3 py-1 bg-white/15 backdrop-blur-sm rounded-full text-xs font-semibold text-white/90 border border-white/10">
                  <Zap className="h-3 w-3 inline mr-1" />
                  IA Avanzada
                </div>
              </div>
              <h2 className="text-2xl lg:text-3xl font-bold text-white mb-3">
                Genera tus documentos con SOPH.IA
              </h2>
              <p className="text-violet-100/80 max-w-lg text-base">
                Sube tu informacion mensual y obtene informe, acta y presentacion
                profesional en minutos con inteligencia artificial.
              </p>
            </div>
            <Link href="/dashboard/generar" className="flex-shrink-0">
              <Button className="bg-white/90 backdrop-blur text-violet-700 hover:bg-white shadow-xl shadow-black/10 gap-2 h-12 px-6 text-base font-semibold rounded-2xl border border-white/50">
                <Sparkles className="h-5 w-5" />
                Nueva Generacion
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {quickActions.map((item) => (
            <Link key={item.href} href={item.href}>
              <div className={`group bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-5 hover:shadow-xl ${item.bgHover} hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full`}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-lg ${item.shadow} group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Usage + Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageCard />
          </div>
          <div className="bg-white/50 backdrop-blur-xl border border-white/30 rounded-3xl p-6 shadow-lg shadow-violet-100/10">
            <h3 className="font-bold text-gray-900 mb-4">Acciones Rapidas</h3>
            <div className="space-y-3">
              <Link href="/dashboard/generar">
                <Button className="w-full gap-2 justify-start h-11 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-lg shadow-violet-500/20">
                  <Sparkles className="h-4 w-4" />
                  Nueva Generacion
                </Button>
              </Link>
              <Link href="/dashboard/propiedades">
                <Button variant="outline" className="w-full gap-2 justify-start h-11 rounded-xl border-white/40 bg-white/30 backdrop-blur hover:bg-white/50">
                  <Building className="h-4 w-4" />
                  Agregar Propiedad
                </Button>
              </Link>
              <Link href="/dashboard/configuracion">
                <Button variant="outline" className="w-full gap-2 justify-start h-11 rounded-xl border-white/40 bg-white/30 backdrop-blur hover:bg-white/50">
                  <Settings className="h-4 w-4" />
                  Configuracion
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
