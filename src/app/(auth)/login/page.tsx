"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  Zap,
  ArrowRight,
  FileText,
  Shield,
  Presentation,
  Check,
} from "lucide-react";

const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Left panel - value proposition (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-purple-600 to-primary relative">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <div className="relative flex flex-col justify-center p-12 xl:p-16">
          <div className="flex items-center gap-2.5 mb-12">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">
              SOPH<span className="text-purple-200">.IA</span>
            </span>
          </div>

          <h2 className="text-3xl xl:text-4xl font-bold text-white leading-tight mb-4">
            Genera tus informes de propiedad horizontal en minutos
          </h2>
          <p className="text-purple-100 text-lg mb-10 max-w-md">
            Deja que la inteligencia artificial se encargue de la redaccion mientras tu te enfocas en administrar.
          </p>

          <div className="space-y-4">
            {[
              { icon: FileText, text: "Informe de gestion completo en PDF" },
              { icon: Shield, text: "Acta legal conforme a Ley 675" },
              { icon: Presentation, text: "Presentacion PPTX para asamblea" },
            ].map((item) => (
              <div key={item.text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-4 w-4 text-white" />
                </div>
                <span className="text-purple-100 text-sm">{item.text}</span>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-white/10">
            <div className="flex items-center gap-2 text-purple-200 text-sm">
              <Check className="h-4 w-4" />
              <span>Usado por +50 administradores en Colombia</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="flex-1 relative">
        {/* Background */}
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-gradient-to-br from-primary/10 to-purple-300/10 rounded-full blur-3xl" />

        {/* Content */}
        <div className="relative flex items-center justify-center w-full min-h-screen p-4">
          <div className="w-full max-w-sm space-y-6">
            {/* Logo - visible on mobile */}
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/25">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold">SOPH<span className="text-gradient">.IA</span></h1>
              <p className="text-muted-foreground text-sm mt-1">
                Documentos de propiedad horizontal con inteligencia artificial
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
    </div>
  );
}
