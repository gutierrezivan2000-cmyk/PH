"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Header } from "@/components/dashboard/Header";
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
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const WHATSAPP_LINK = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_URL || "https://wa.me/message/PLACEHOLDER";

interface Profile {
  name: string;
  email: string;
  image: string;
  cargo: string;
  phone: string;
  company: string;
  city: string;
}

// Mono label style
const monoLabel = {
  fontFamily: "'Geist Mono', monospace",
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

// Shared hi-fi card style
const hiCard = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "1rem",
  padding: "28px",
};

// Input style override
const hiInput = {
  background: "var(--secondary)",
  border: "1px solid var(--border)",
  borderRadius: "0.75rem",
  color: "var(--foreground)",
  fontSize: 14,
};

export default function ConfiguracionPage() {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    try {
      await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cargo, company, phone, city }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore
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
      <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-2xl space-y-5">

        {/* ── Información Personal ────────────────────────────────────── */}
        <div style={hiCard}>
          {/* Section header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(124,92,255,0.12)" }}
            >
              <User className="h-4.5 w-4.5" style={{ color: "#7c5cff" }} />
            </div>
            <div>
              <p style={{ ...monoLabel, color: "var(--muted-foreground)" }}>Perfil</p>
              <h2 className="text-base font-medium text-foreground leading-snug">
                Información Personal
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--muted-foreground)" }} />
            </div>
          ) : (
            <div className="space-y-5">
              {/* Avatar + email */}
              <div
                className="flex items-center gap-4 pb-5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                {session?.user?.image ? (
                  <img
                    src={session.user.image}
                    alt=""
                    className="h-16 w-16 rounded-2xl flex-shrink-0"
                    style={{ border: "2px solid var(--border)" }}
                  />
                ) : (
                  <div
                    className="h-16 w-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(124,92,255,0.10)", border: "1px solid rgba(124,92,255,0.20)" }}
                  >
                    <User className="h-8 w-8" style={{ color: "#7c5cff" }} />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground">{profile?.name || session?.user?.name}</p>
                  <p className="text-sm mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {profile?.email || session?.user?.email}
                  </p>
                  <span
                    className="inline-block mt-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{
                      fontFamily: "'Geist Mono', monospace",
                      letterSpacing: "0.10em",
                      background: "rgba(255,255,255,0.05)",
                      color: "var(--muted-foreground)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    Google Account
                  </span>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                  <User className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                  Nombre completo
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={hiInput}
                  className="rounded-xl focus:ring-2 focus:ring-[#7c5cff]/40 focus:border-[#7c5cff]"
                />
              </div>

              {/* Cargo */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                  <Briefcase className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                  Cargo
                </label>
                <select
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  style={{
                    ...hiInput,
                    width: "100%",
                    height: 40,
                    paddingLeft: 12,
                    paddingRight: 12,
                    appearance: "none",
                    cursor: "pointer",
                    outline: "none",
                  }}
                  className="focus:ring-2 focus:ring-[#7c5cff]/40 focus:border-[#7c5cff] transition-all"
                >
                  <option value="">Selecciona tu cargo</option>
                  {cargos.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Company */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                  <Building2 className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                  Empresa / Razón Social
                </label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nombre de tu empresa"
                  style={hiInput}
                  className="rounded-xl focus:ring-2 focus:ring-[#7c5cff]/40 focus:border-[#7c5cff]"
                />
              </div>

              {/* Phone + city */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                    <Phone className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                    Teléfono
                  </label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+57 300 123 4567"
                    style={hiInput}
                    className="rounded-xl focus:ring-2 focus:ring-[#7c5cff]/40 focus:border-[#7c5cff]"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1.5">
                    <MapPin className="h-3.5 w-3.5" style={{ color: "var(--muted-foreground)" }} />
                    Ciudad
                  </label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Bogotá"
                    style={hiInput}
                    className="rounded-xl focus:ring-2 focus:ring-[#7c5cff]/40 focus:border-[#7c5cff]"
                  />
                </div>
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-11 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: saved ? "#4cd6a0" : "#7c5cff",
                  boxShadow: saved
                    ? "0 4px 16px rgba(76,214,160,0.30)"
                    : "0 4px 16px rgba(124,92,255,0.30)",
                  transition: "background 0.3s, box-shadow 0.3s",
                }}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Guardando..." : saved ? "Guardado!" : "Guardar Cambios"}
              </button>
            </div>
          )}
        </div>

        {/* ── Apariencia ──────────────────────────────────────────────── */}
        <div style={hiCard}>
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,185,88,0.12)" }}
            >
              <Sun className="h-4.5 w-4.5" style={{ color: "#ffb958" }} />
            </div>
            <div>
              <p style={{ ...monoLabel, color: "var(--muted-foreground)" }}>Tema</p>
              <h2 className="text-base font-medium text-foreground leading-snug">Apariencia</h2>
            </div>
          </div>

          <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
            Selecciona el tema de la interfaz.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {([
              { value: "light" as const, label: "Claro",  icon: Sun },
              { value: "dark"  as const, label: "Oscuro", icon: Moon },
              { value: "auto"  as const, label: "Auto",   icon: Monitor },
            ]).map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl transition-all"
                  style={{
                    background: active ? "rgba(124,92,255,0.10)" : "var(--secondary)",
                    border: active ? "1px solid rgba(124,92,255,0.40)" : "1px solid var(--border)",
                  }}
                >
                  <opt.icon
                    className="h-5 w-5"
                    style={{ color: active ? "#7c5cff" : "var(--muted-foreground)" }}
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: active ? "#7c5cff" : "var(--muted-foreground)" }}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Soporte ─────────────────────────────────────────────────── */}
        <div style={hiCard}>
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(76,214,160,0.12)" }}
            >
              <MessageCircle className="h-4.5 w-4.5" style={{ color: "#4cd6a0" }} />
            </div>
            <div>
              <p style={{ ...monoLabel, color: "var(--muted-foreground)" }}>Ayuda</p>
              <h2 className="text-base font-medium text-foreground leading-snug">Soporte</h2>
            </div>
          </div>

          <p className="text-sm mb-5" style={{ color: "var(--muted-foreground)" }}>
            ¿Necesitas ayuda? Contacta a nuestro equipo de soporte por WhatsApp.
          </p>

          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="block">
            <button
              className="w-full h-11 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{
                background: "rgba(76,214,160,0.10)",
                border: "1px solid rgba(76,214,160,0.25)",
                color: "#4cd6a0",
              }}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Contactar por WhatsApp
            </button>
          </a>
        </div>

      </div>
    </div>
  );
}
