"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Building2,
  Phone,
  MapPin,
  Briefcase,
  Save,
  Check,
  Loader2,
  MessageCircle,
  AlertCircle,
} from "lucide-react";

const WHATSAPP_LINK = "https://wa.me/message/PLACEHOLDER";

interface Profile {
  name: string;
  email: string;
  image: string;
  cargo: string;
  phone: string;
  company: string;
  city: string;
}

export default function ConfiguracionPage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Editable fields
  const [name, setName] = useState("");
  const [cargo, setCargo] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setName(data.name || "");
        setCargo(data.cargo || "");
        setCompany(data.company || "");
        setPhone(data.phone || "");
        setCity(data.city || "");
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cargo, company, phone, city }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Error al guardar los cambios. Intenta de nuevo.");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Error de conexion. Verifica tu internet e intenta de nuevo.");
    } finally {
      setSaving(false);
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
    <div>
      <Header title="Configuracion" />
      <div className="p-6 lg:p-8 max-w-3xl mx-auto w-full space-y-6">
        {/* Profile Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Informacion Personal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Avatar + email */}
                <div className="flex items-center gap-4 pb-4 border-b border-border/50">
                  {session?.user?.image ? (
                    <img
                      src={session.user.image}
                      alt=""
                      className="h-16 w-16 rounded-2xl ring-2 ring-border/50"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold">{profile?.name || session?.user?.name}</p>
                    <p className="text-sm text-muted-foreground">{profile?.email || session?.user?.email}</p>
                    <Badge variant="outline" className="mt-1 text-xs">Google Account</Badge>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Nombre completo
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" /> Cargo
                  </label>
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
                  <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> Empresa / Razon Social
                  </label>
                  <Input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Nombre de tu empresa"
                    className="rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> Telefono
                    </label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+57 300 123 4567"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> Ciudad
                    </label>
                    <Input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Bogota"
                      className="rounded-xl"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full h-11 rounded-2xl gap-2"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {saving ? "Guardando..." : saved ? "Guardado!" : "Guardar Cambios"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Support Card */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-emerald-600" />
              Soporte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              ¿Necesitas ayuda? Contacta a nuestro equipo de soporte por WhatsApp.
            </p>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="w-full h-11 rounded-2xl gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Contactar por WhatsApp
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
