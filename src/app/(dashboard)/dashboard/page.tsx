"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Building, History, Sparkles, ArrowRight, Loader2 } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function DashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(!IS_DEMO);

  useEffect(() => {
    if (IS_DEMO) return;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        if (!data.onboarded) {
          router.replace("/dashboard/onboarding");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-8 space-y-8 max-w-5xl">
        {/* Welcome + CTA */}
        <div className="bg-gradient-to-r from-primary via-purple-600 to-primary rounded-2xl p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10" />
          <div className="relative">
            <h2 className="text-2xl font-bold mb-2">Genera tus documentos</h2>
            <p className="text-purple-100 mb-6 max-w-md">
              Sube tu informacion mensual y obtene informe, acta y presentacion en minutos.
            </p>
            <Link href="/dashboard/generar">
              <Button className="bg-white text-primary hover:bg-white/90 shadow-lg gap-2">
                <Sparkles className="h-4 w-4" />
                Nueva Generacion
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              href: "/dashboard/generar",
              icon: FileText,
              title: "Generar Documentos",
              subtitle: "Informe, Acta y Presentacion",
              iconBg: "bg-primary/10",
              iconColor: "text-primary",
            },
            {
              href: "/dashboard/propiedades",
              icon: Building,
              title: "Mis Propiedades",
              subtitle: "Gestionar propiedades",
              iconBg: "bg-emerald-50",
              iconColor: "text-emerald-600",
            },
            {
              href: "/dashboard/historial",
              icon: History,
              title: "Historial",
              subtitle: "Documentos generados",
              iconBg: "bg-purple-50",
              iconColor: "text-purple-600",
            },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="group hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer h-full">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className={`w-12 h-12 ${item.iconBg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                    <item.icon className={`h-6 w-6 ${item.iconColor}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.subtitle}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Usage */}
        <div className="grid md:grid-cols-2 gap-6">
          <UsageCard />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Acciones Rapidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/dashboard/generar">
                <Button className="w-full gap-2 justify-start">
                  <Sparkles className="h-4 w-4" />
                  Nueva Generacion
                </Button>
              </Link>
              <Link href="/dashboard/propiedades">
                <Button variant="outline" className="w-full gap-2 justify-start">
                  <Building className="h-4 w-4" />
                  Agregar Propiedad
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
