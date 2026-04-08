"use client";

import Link from "next/link";
import { Header } from "@/components/dashboard/Header";
import { UsageCard } from "@/components/dashboard/UsageCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Building, History, Plus } from "lucide-react";

export default function DashboardPage() {
  return (
    <div>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">
        {/* Quick actions */}
        <div className="grid md:grid-cols-3 gap-4">
          <Link href="/dashboard/generar">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">Generar Documentos</p>
                  <p className="text-sm text-muted-foreground">Informe, Acta y Presentacion</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/propiedades">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Building className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold">Mis Propiedades</p>
                  <p className="text-sm text-muted-foreground">Gestionar propiedades</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard/historial">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardContent className="flex items-center gap-4 p-6">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <History className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold">Historial</p>
                  <p className="text-sm text-muted-foreground">Documentos generados</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Usage */}
        <div className="grid md:grid-cols-2 gap-6">
          <UsageCard />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Accion Rapida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Link href="/dashboard/generar">
                <Button className="w-full gap-2">
                  <Plus className="h-4 w-4" />
                  Nueva Generacion
                </Button>
              </Link>
              <Link href="/dashboard/propiedades">
                <Button variant="outline" className="w-full gap-2">
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
