"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Zap, ArrowRight } from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-grid" />
      <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-gradient-to-br from-primary/15 to-purple-300/15 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-gradient-to-tl from-emerald-200/15 to-transparent rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative flex items-center justify-center w-full p-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/25">
              <Building2 className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">PH Gestion</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Plataforma de gestion para propiedad horizontal
            </p>
          </div>

          {/* Demo banner */}
          {IS_DEMO && (
            <div className="bg-amber-50 border border-amber-200/80 rounded-2xl px-4 py-3 text-center">
              <p className="text-sm font-medium text-amber-800 flex items-center justify-center gap-2">
                <Zap className="h-4 w-4" />
                Modo Demo — no se requieren credenciales
              </p>
            </div>
          )}

          <Card className="border-border/40 shadow-xl shadow-black/5">
            <CardContent className="p-8 space-y-4">
              {/* Demo login button */}
              {IS_DEMO && (
                <Button
                  onClick={() =>
                    signIn("demo", { callbackUrl: "/dashboard" })
                  }
                  className="w-full h-12 text-base gap-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/25 rounded-2xl"
                >
                  <Zap className="h-5 w-5" />
                  Entrar al Demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {/* Google login */}
              {!IS_DEMO && (
                <Button
                  onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                  variant="outline"
                  className="w-full h-12 text-base gap-3 rounded-2xl"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continuar con Google
                </Button>
              )}

              {IS_DEMO && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  Datos simulados. Los documentos generados son reales y descargables.
                </p>
              )}
            </CardContent>
          </Card>

          <p className="text-xs text-center text-muted-foreground">
            Al continuar, aceptas los terminos de servicio y la politica de privacidad.
          </p>
        </div>
      </div>
    </div>
  );
}
