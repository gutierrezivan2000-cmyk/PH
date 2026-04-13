"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Building2,
  User,
  Building,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
} from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Profile
  const [name, setName] = useState(session?.user?.name ?? "");
  const [cargo, setCargo] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  // Step 2: First property
  const [propName, setPropName] = useState("");
  const [propAddress, setPropAddress] = useState("");
  const [propCity, setPropCity] = useState("");
  const [propUnits, setPropUnits] = useState("");

  const handleFinish = async () => {
    setLoading(true);
    try {
      // Save profile
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cargo, company, phone, city, onboarded: true }),
      });

      // Save property if filled
      if (propName.trim()) {
        await fetch("/api/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: propName,
            address: propAddress,
            city: propCity,
            units: propUnits,
          }),
        });
      }

      router.push("/dashboard");
    } catch {
      // Continue anyway
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const cargos = [
    "Administrador(a) de P.H.",
    "Gerente de Administracion",
    "Contador(a)",
    "Revisor(a) Fiscal",
    "Asistente Administrativo",
    "Otro",
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Progress */}
        <div className="flex items-center justify-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step >= s
                    ? "bg-primary text-white shadow-lg shadow-primary/30"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {step > s ? <Check className="h-5 w-5" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-16 h-1 rounded-full transition-all ${
                    step > s ? "bg-primary" : "bg-secondary"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Welcome + Profile */}
        {step === 1 && (
          <Card className="border-border/40 shadow-xl">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
                  <User className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Bienvenido a PH Gestion</h2>
                <p className="text-muted-foreground mt-2">
                  Cuentanos sobre ti para personalizar tu experiencia
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Nombre completo *</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre"
                    className="rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Cargo *</label>
                  <select
                    value={cargo}
                    onChange={(e) => setCargo(e.target.value)}
                    className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecciona tu cargo</option>
                    {cargos.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Empresa / Razon Social</label>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Nombre de tu empresa"
                    className="rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Telefono</label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+57 300 123 4567"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Ciudad</label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Bogota"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={() => setStep(2)}
                disabled={!name.trim() || !cargo}
                className="w-full mt-6 h-12 rounded-2xl gap-2"
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: First Property */}
        {step === 2 && (
          <Card className="border-border/40 shadow-xl">
            <CardContent className="p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
                  <Building className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Tu primera propiedad</h2>
                <p className="text-muted-foreground mt-2">
                  Agrega la propiedad horizontal que administras
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Nombre del conjunto/edificio *</label>
                  <Input
                    value={propName}
                    onChange={(e) => setPropName(e.target.value)}
                    placeholder="Ej: Conjunto Residencial Los Pinos"
                    className="rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Direccion</label>
                  <Input
                    value={propAddress}
                    onChange={(e) => setPropAddress(e.target.value)}
                    placeholder="Ej: Carrera 45 #23-67"
                    className="rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Ciudad</label>
                    <Input
                      value={propCity}
                      onChange={(e) => setPropCity(e.target.value)}
                      placeholder="Bogota"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Num. unidades</label>
                    <Input
                      type="number"
                      value={propUnits}
                      onChange={(e) => setPropUnits(e.target.value)}
                      placeholder="120"
                      className="rounded-xl"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} className="h-12 rounded-2xl gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Atras
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!propName.trim()}
                  className="flex-1 h-12 rounded-2xl gap-2"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              <button
                onClick={() => setStep(3)}
                className="w-full text-sm text-muted-foreground hover:text-foreground mt-3 transition-colors"
              >
                Omitir por ahora
              </button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Ready */}
        {step === 3 && (
          <Card className="border-border/40 shadow-xl">
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/25">
                <Sparkles className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Todo listo!</h2>
              <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
                Tu cuenta esta configurada. Ya puedes empezar a generar informes de gestion,
                actas legales y presentaciones con inteligencia artificial.
              </p>

              <div className="bg-secondary/50 rounded-2xl p-5 mb-8 text-left space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">{cargo}</p>
                  </div>
                </div>
                {propName && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Building className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{propName}</p>
                      <p className="text-xs text-muted-foreground">{propCity || "Sin ciudad"} - {propUnits || "?"} unidades</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} className="h-12 rounded-2xl gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Atras
                </Button>
                <Button
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex-1 h-12 rounded-2xl gap-2"
                >
                  {loading ? "Guardando..." : "Ir al Dashboard"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span className="text-sm font-medium">PH Gestion</span>
        </div>
      </div>
    </div>
  );
}
