"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        // Only redirect to onboarding if we got a valid response AND user hasn't onboarded
        if (data.onboarded === false && !data.error) {
          router.replace("/dashboard/onboarding");
        } else {
          setChecking(false);
        }
      })
      .catch(() => {
        // If profile check fails, don't block — show dashboard
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

  return (
    <div>
      <Header title="Dashboard" subtitle="Bienvenido a tu panel de gestion" />
      <div className="p-6 lg:p-10 space-y-8 max-w-7xl mx-auto">
        {/* Welcome + CTA */}
        <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 rounded-2xl p-8 lg:p-10 text-white relative overflow-hidden shadow-xl shadow-violet-500/20">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjEpIi8+PC9zdmc+')] opacity-30" />
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
          <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="px-3 py-1 bg-white/15 rounded-full text-xs font-semibold backdrop-blur-sm">
                  <Zap className="h-3 w-3 inline mr-1" />
                  IA Avanzada
                </div>
              </div>
              <h2 className="text-2xl lg:text-3xl font-bold mb-3">
                Genera tus documentos con SOPH.IA
              </h2>
              <p className="text-violet-100 max-w-lg text-base">
                Sube tu informacion mensual y obtene informe, acta y presentacion
                profesional en minutos con inteligencia artificial.
              </p>
            </div>
            <Link href="/dashboard/generar" className="flex-shrink-0">
              <Button className="bg-white text-violet-700 hover:bg-violet-50 shadow-lg gap-2 h-12 px-6 text-base font-semibold rounded-xl">
                <Sparkles className="h-5 w-5" />
                Nueva Generacion
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              href: "/dashboard/generar",
              icon: FileText,
              title: "Generar Documentos",
              subtitle: "Informe, Acta y Presentacion",
              iconBg: "bg-violet-50",
              iconColor: "text-violet-600",
              borderHover: "hover:border-violet-200",
            },
            {
              href: "/dashboard/propiedades",
              icon: Building,
              title: "Mis Propiedades",
              subtitle: "Gestionar propiedades",
              iconBg: "bg-emerald-50",
              iconColor: "text-emerald-600",
              borderHover: "hover:border-emerald-200",
            },
            {
              href: "/dashboard/historial",
              icon: History,
              title: "Historial",
              subtitle: "Documentos generados",
              iconBg: "bg-purple-50",
              iconColor: "text-purple-600",
              borderHover: "hover:border-purple-200",
            },
            {
              href: "/dashboard/suscripcion",
              icon: CreditCard,
              title: "Suscripcion",
              subtitle: "Gestionar tu plan",
              iconBg: "bg-amber-50",
              iconColor: "text-amber-600",
              borderHover: "hover:border-amber-200",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className={`group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full border-transparent ${item.borderHover}`}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`w-12 h-12 ${item.iconBg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                    <item.icon className={`h-6 w-6 ${item.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Usage + Quick Actions */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <UsageCard />
          </div>
          <Card className="border-gray-200/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-gray-900">Acciones Rapidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/dashboard/generar">
                <Button className="w-full gap-2 justify-start h-11 rounded-xl bg-violet-600 hover:bg-violet-700">
                  <Sparkles className="h-4 w-4" />
                  Nueva Generacion
                </Button>
              </Link>
              <Link href="/dashboard/propiedades">
                <Button variant="outline" className="w-full gap-2 justify-start h-11 rounded-xl border-gray-200">
                  <Building className="h-4 w-4" />
                  Agregar Propiedad
                </Button>
              </Link>
              <Link href="/dashboard/configuracion">
                <Button variant="outline" className="w-full gap-2 justify-start h-11 rounded-xl border-gray-200">
                  <Settings className="h-4 w-4" />
                  Configuracion
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
