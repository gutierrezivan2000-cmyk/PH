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
  FileText,
  Upload,
  Wand2,
  Download,
  ClipboardList,
  MessageSquare,
  GraduationCap,
  X,
  Loader2,
  BookOpen,
  Shield,
} from "lucide-react";
import { upload as blobUpload } from "@vercel/blob/client";

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

  // Step 2.5: Property documents
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [reglamentoFile, setReglamentoFile] = useState<File | null>(null);
  const [uploadingDocs, setUploadingDocs] = useState(false);

  const [error, setError] = useState("");

  const TOTAL_STEPS = 4;

  const handleFinish = async () => {
    setLoading(true);
    setError("");
    try {
      const profileRes = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, cargo, company, phone, city, onboarded: true }),
      });

      if (!profileRes.ok) {
        const data = await profileRes.json();
        setError(data.error || "Error al guardar el perfil. Intenta de nuevo.");
        setLoading(false);
        return;
      }

      if (propName.trim()) {
        const propRes = await fetch("/api/properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: propName,
            address: propAddress,
            city: propCity,
            units: propUnits,
          }),
        });
        if (propRes.ok) {
          const propData = await propRes.json();
          const propertyId = propData.id;

          const docsToUpload = [
            { file: manualFile, type: "manual_convivencia" },
            { file: reglamentoFile, type: "reglamento_interno" },
          ];

          for (const doc of docsToUpload) {
            if (!doc.file) continue;
            try {
              const safeName = doc.file.name.replace(/[^\w.\-]+/g, "_");
              const result = await blobUpload(`property-docs/${propertyId}/${Date.now()}-${safeName}`, doc.file, {
                access: "private",
                handleUploadUrl: "/api/upload/token",
                contentType: doc.file.type || "application/octet-stream",
              });
              await fetch(`/api/properties/${propertyId}/documents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: doc.type,
                  name: doc.file.name,
                  url: result.url,
                  size: doc.file.size,
                  mimeType: doc.file.type,
                }),
              });
            } catch (err) {
              console.error("[ONBOARDING] Doc upload failed:", err);
            }
          }
        } else {
          console.error("[ONBOARDING] Property save failed");
        }
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Error de conexion. Intenta de nuevo.");
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

  /* ── shared input style ── */
  const inputBase: React.CSSProperties = {
    background: "#1d1d24",
    border: "1px solid rgba(255,255,255,0.07)",
    color: "#f6f5f7",
    fontFamily: "'Geist', system-ui, sans-serif",
    borderRadius: 10,
    fontSize: 14,
    padding: "10px 14px",
    width: "100%",
    outline: "none",
    transition: "border 0.15s, box-shadow 0.15s",
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.border = "1px solid rgba(124,92,255,0.50)";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,255,0.12)";
  };
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
    e.currentTarget.style.boxShadow = "none";
  };

  const stepLabels = [
    "Tu perfil",
    "Primera propiedad",
    "Como funciona",
    "Listo",
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#0a0a0a" }}
    >
      {/* Background orbs */}
      <div
        className="hifi-orb-drift pointer-events-none absolute"
        style={{
          width: 560,
          height: 560,
          top: "-20%",
          left: "-10%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,92,255,0.12) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="hifi-orb-drift pointer-events-none absolute"
        style={{
          width: 400,
          height: 400,
          bottom: "-15%",
          right: "-8%",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(95,180,255,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
          animationDelay: "-9s",
        }}
      />

      <div className="relative z-10 w-full max-w-[600px] space-y-6">

        {/* Top: logo + step indicator */}
        <div className="flex flex-col items-center gap-3">
          {/* Logo glyph */}
          <div
            className="flex items-center justify-center rounded-2xl"
            style={{
              width: 44,
              height: 44,
              background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
              boxShadow: "0 0 28px rgba(124,92,255,0.30)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 20,
                color: "#fff",
                letterSpacing: "-0.03em",
              }}
            >
              S
            </span>
          </div>

          {/* Brand */}
          <span
            style={{
              fontFamily: "'Geist', system-ui, sans-serif",
              fontWeight: 500,
              fontSize: 18,
              letterSpacing: "-0.02em",
              color: "#f6f5f7",
            }}
          >
            SOPH
            <span style={{ color: "rgba(246,245,247,0.35)" }}>.</span>
            <span style={{ color: "#7c5cff" }}>IA</span>
          </span>

          {/* Step indicator */}
          <p
            style={{
              fontFamily: "'Geist Mono', ui-monospace, monospace",
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(246,245,247,0.42)",
            }}
          >
            Paso {step} de {TOTAL_STEPS} &mdash; {stepLabels[step - 1]}
          </p>
        </div>

        {/* Progress bar */}
        <div
          style={{
            height: 2,
            borderRadius: 2,
            background: "rgba(255,255,255,0.07)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 2,
              background: "linear-gradient(90deg, #7c5cff, #9a7fff)",
              width: `${(step / TOTAL_STEPS) * 100}%`,
              transition: "width 0.4s cubic-bezier(0.16,1,0.3,1)",
            }}
          />
        </div>

        {/* ── STEP 1: Profile ── */}
        {step === 1 && (
          <div
            className="rounded-2xl p-8 hifi-ring-glow"
            style={{
              background: "linear-gradient(145deg, #15151a 0%, #18181f 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 0 60px rgba(124,92,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Eyebrow */}
            <p
              className="mb-2"
              style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(246,245,247,0.42)",
              }}
            >
              Bienvenido
            </p>

            {/* Heading */}
            <h1
              className="mb-1"
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.025em",
                color: "#f6f5f7",
                lineHeight: 1.1,
              }}
            >
              Cuentanos sobre ti.
            </h1>
            <p
              className="mb-8"
              style={{ fontSize: 14, color: "rgba(246,245,247,0.66)", lineHeight: 1.6 }}
            >
              Personaliza tu experiencia en SOPH.IA con tu informacion profesional.
            </p>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label
                  className="block mb-1.5"
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(246,245,247,0.42)",
                  }}
                >
                  Nombre completo *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                  style={inputBase}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {/* Cargo */}
              <div>
                <label
                  className="block mb-1.5"
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(246,245,247,0.42)",
                  }}
                >
                  Cargo *
                </label>
                <select
                  value={cargo}
                  onChange={(e) => setCargo(e.target.value)}
                  style={{ ...inputBase, paddingRight: 36 }}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                >
                  <option value="">Selecciona tu cargo</option>
                  {cargos.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Company */}
              <div>
                <label
                  className="block mb-1.5"
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(246,245,247,0.42)",
                  }}
                >
                  Empresa / Razon Social
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nombre de tu empresa"
                  style={inputBase}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              {/* Phone + City row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block mb-1.5"
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.42)",
                    }}
                  >
                    Telefono
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+57 300 123 4567"
                    style={inputBase}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
                <div>
                  <label
                    className="block mb-1.5"
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.42)",
                    }}
                  >
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Bogota"
                    style={inputBase}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!name.trim() || !cargo}
              className="w-full mt-8 flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              style={{
                background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                boxShadow: "0 4px 20px rgba(124,92,255,0.25)",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                fontFamily: "'Geist', system-ui, sans-serif",
              }}
            >
              Continuar
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ── STEP 2: First Property ── */}
        {step === 2 && (
          <div
            className="rounded-2xl p-8 hifi-ring-glow"
            style={{
              background: "linear-gradient(145deg, #15151a 0%, #18181f 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 0 60px rgba(124,92,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <p
              className="mb-2"
              style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(246,245,247,0.42)",
              }}
            >
              Bienvenido
            </p>
            <h1
              className="mb-1"
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.025em",
                color: "#f6f5f7",
                lineHeight: 1.1,
              }}
            >
              Tu primera propiedad.
            </h1>
            <p
              className="mb-8"
              style={{ fontSize: 14, color: "rgba(246,245,247,0.66)", lineHeight: 1.6 }}
            >
              Agrega el conjunto o edificio que administras. Podras agregar mas desde el panel.
            </p>

            <div className="space-y-4">
              <div>
                <label
                  className="block mb-1.5"
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(246,245,247,0.42)",
                  }}
                >
                  Nombre del conjunto / edificio *
                </label>
                <input
                  type="text"
                  value={propName}
                  onChange={(e) => setPropName(e.target.value)}
                  placeholder="Ej: Conjunto Residencial Los Pinos"
                  style={inputBase}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label
                  className="block mb-1.5"
                  style={{
                    fontFamily: "'Geist Mono', ui-monospace, monospace",
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "rgba(246,245,247,0.42)",
                  }}
                >
                  Direccion
                </label>
                <input
                  type="text"
                  value={propAddress}
                  onChange={(e) => setPropAddress(e.target.value)}
                  placeholder="Ej: Carrera 45 #23-67"
                  style={inputBase}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    className="block mb-1.5"
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.42)",
                    }}
                  >
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={propCity}
                    onChange={(e) => setPropCity(e.target.value)}
                    placeholder="Bogota"
                    style={inputBase}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
                <div>
                  <label
                    className="block mb-1.5"
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.42)",
                    }}
                  >
                    Num. unidades
                  </label>
                  <input
                    type="number"
                    value={propUnits}
                    onChange={(e) => setPropUnits(e.target.value)}
                    placeholder="120"
                    style={inputBase}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                </div>
              </div>
            </div>

            {/* Property Documents */}
            {propName.trim() && (
              <div
                className="mt-6 pt-5 space-y-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4" style={{ color: "#7c5cff" }} />
                  <span
                    style={{
                      fontFamily: "'Geist Mono', ui-monospace, monospace",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(246,245,247,0.42)",
                    }}
                  >
                    Documentos de la propiedad
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(246,245,247,0.42)", lineHeight: 1.6 }}>
                  Sube el manual de convivencia y reglamento interno. La IA los usara como contexto para generar informes mas precisos.
                </p>

                <div className="space-y-2">
                  {/* Manual */}
                  <label
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
                    style={{
                      border: "1px dashed rgba(255,255,255,0.10)",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(124,92,255,0.30)";
                      e.currentTarget.style.background = "rgba(124,92,255,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Shield className="h-5 w-5 flex-shrink-0" style={{ color: "#7c5cff" }} />
                    <div className="flex-1 min-w-0">
                      {manualFile ? (
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, color: "#9a7fff" }} className="truncate">{manualFile.name}</span>
                          <button
                            onClick={(e) => { e.preventDefault(); setManualFile(null); }}
                            className="p-0.5 rounded hover:opacity-70 transition-opacity"
                          >
                            <X className="h-3 w-3" style={{ color: "rgba(246,245,247,0.4)" }} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, color: "rgba(246,245,247,0.66)", fontWeight: 500 }}>Manual de Convivencia</span>
                          <span className="block" style={{ fontSize: 11, color: "rgba(246,245,247,0.35)" }}>PDF o Word</span>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => { if (e.target.files?.[0]) setManualFile(e.target.files[0]); }}
                    />
                  </label>

                  {/* Reglamento */}
                  <label
                    className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
                    style={{
                      border: "1px dashed rgba(255,255,255,0.10)",
                      background: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "rgba(76,214,160,0.30)";
                      e.currentTarget.style.background = "rgba(76,214,160,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <FileText className="h-5 w-5 flex-shrink-0" style={{ color: "#4cd6a0" }} />
                    <div className="flex-1 min-w-0">
                      {reglamentoFile ? (
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, color: "#4cd6a0" }} className="truncate">{reglamentoFile.name}</span>
                          <button
                            onClick={(e) => { e.preventDefault(); setReglamentoFile(null); }}
                            className="p-0.5 rounded hover:opacity-70 transition-opacity"
                          >
                            <X className="h-3 w-3" style={{ color: "rgba(246,245,247,0.4)" }} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, color: "rgba(246,245,247,0.66)", fontWeight: 500 }}>Reglamento Interno</span>
                          <span className="block" style={{ fontSize: 11, color: "rgba(246,245,247,0.35)" }}>PDF o Word</span>
                        </>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.doc"
                      onChange={(e) => { if (e.target.files?.[0]) setReglamentoFile(e.target.files[0]); }}
                    />
                  </label>
                </div>

                <p style={{ fontSize: 11, color: "rgba(246,245,247,0.28)", fontStyle: "italic" }}>
                  Opcional &mdash; puedes subirlos despues desde Propiedades.
                </p>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 rounded-xl px-5 py-3 transition-all duration-150 hover:opacity-80 active:scale-[0.98] cursor-pointer"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(246,245,247,0.66)",
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Atras
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!propName.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                  boxShadow: "0 4px 20px rgba(124,92,255,0.25)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                Continuar
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => setStep(3)}
              className="w-full mt-3 text-center transition-colors"
              style={{ fontSize: 12, color: "rgba(246,245,247,0.35)" }}
            >
              Omitir por ahora
            </button>
          </div>
        )}

        {/* ── STEP 3: Tutorial ── */}
        {step === 3 && (
          <div
            className="rounded-2xl p-8 hifi-ring-glow"
            style={{
              background: "linear-gradient(145deg, #15151a 0%, #18181f 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 0 60px rgba(124,92,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            <p
              className="mb-2"
              style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(246,245,247,0.42)",
              }}
            >
              Bienvenido
            </p>
            <h1
              className="mb-1"
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.025em",
                color: "#f6f5f7",
                lineHeight: 1.1,
              }}
            >
              Como usar SOPH.IA.
            </h1>
            <p
              className="mb-8"
              style={{ fontSize: 14, color: "rgba(246,245,247,0.66)", lineHeight: 1.6 }}
            >
              Genera documentos profesionales en minutos con el poder de la IA.
            </p>

            <div className="space-y-4">
              {[
                {
                  icon: Upload,
                  color: "#5fb4ff",
                  bg: "rgba(95,180,255,0.10)",
                  title: "1. Sube tus insumos",
                  desc: "Carga actas, estados financieros, grabaciones de juntas, fotos y cualquier documento relevante. La IA extrae la informacion automaticamente.",
                },
                {
                  icon: ClipboardList,
                  color: "#7c5cff",
                  bg: "rgba(124,92,255,0.10)",
                  title: "2. Selecciona que generar",
                  desc: "Elige los documentos que necesitas: Informe de Gestion, Acta Legal y/o Presentacion PPTX. Todos son opcionales.",
                },
                {
                  icon: Wand2,
                  color: "#9a7fff",
                  bg: "rgba(154,127,255,0.10)",
                  title: "3. La IA genera tus documentos",
                  desc: "SOPH.IA analiza los insumos y genera documentos profesionales con estructura legal colombiana (Ley 675).",
                },
                {
                  icon: MessageSquare,
                  color: "#4cd6a0",
                  bg: "rgba(76,214,160,0.10)",
                  title: "4. Revisa y corrige con IA",
                  desc: "Revisa el resultado, solicita correcciones en lenguaje natural y sube archivos adicionales si falta informacion.",
                },
                {
                  icon: Download,
                  color: "#ffb958",
                  bg: "rgba(255,185,88,0.10)",
                  title: "5. Descarga y comparte",
                  desc: "Descarga tus documentos en PDF y PPTX, listos para presentar en la asamblea o entregar al consejo.",
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div
                    className="flex items-center justify-center rounded-xl flex-shrink-0"
                    style={{
                      width: 36,
                      height: 36,
                      background: item.bg,
                      border: `1px solid ${item.color}30`,
                    }}
                  >
                    <item.icon className="h-4 w-4" style={{ color: item.color }} />
                  </div>
                  <div className="min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 600, color: "#f6f5f7" }}>{item.title}</p>
                    <p style={{ fontSize: 12, color: "rgba(246,245,247,0.55)", marginTop: 3, lineHeight: 1.6 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 rounded-xl px-5 py-3 transition-all duration-150 hover:opacity-80 active:scale-[0.98] cursor-pointer"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(246,245,247,0.66)",
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Atras
              </button>
              <button
                onClick={() => setStep(4)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                  boxShadow: "0 4px 20px rgba(124,92,255,0.25)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                Entendido
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Ready ── */}
        {step === 4 && (
          <div
            className="rounded-2xl p-8 hifi-ring-glow"
            style={{
              background: "linear-gradient(145deg, #15151a 0%, #18181f 100%)",
              border: "1px solid rgba(255,255,255,0.07)",
              boxShadow: "0 0 60px rgba(124,92,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)",
            }}
          >
            {/* Icon */}
            <div
              className="flex items-center justify-center rounded-2xl mx-auto mb-6"
              style={{
                width: 64,
                height: 64,
                background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                boxShadow: "0 0 40px rgba(124,92,255,0.30)",
              }}
            >
              <Check className="h-8 w-8" style={{ color: "#fff" }} />
            </div>

            <p
              className="text-center mb-2"
              style={{
                fontFamily: "'Geist Mono', ui-monospace, monospace",
                fontSize: 10,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(246,245,247,0.42)",
              }}
            >
              Configuracion completa
            </p>

            <h1
              className="text-center mb-2"
              style={{
                fontFamily: "'Geist', system-ui, sans-serif",
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.025em",
                color: "#f6f5f7",
              }}
            >
              Todo listo.
            </h1>
            <p
              className="text-center mb-8"
              style={{ fontSize: 14, color: "rgba(246,245,247,0.66)", lineHeight: 1.6, maxWidth: 360, margin: "0 auto 32px" }}
            >
              Tu cuenta esta configurada. Ya puedes empezar a generar informes de gestion,
              actas legales y presentaciones con inteligencia artificial.
            </p>

            {/* Summary card */}
            <div
              className="rounded-xl p-5 mb-6 space-y-3"
              style={{
                background: "#1d1d24",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    width: 32,
                    height: 32,
                    background: "rgba(124,92,255,0.10)",
                    border: "1px solid rgba(124,92,255,0.20)",
                  }}
                >
                  <User className="h-4 w-4" style={{ color: "#7c5cff" }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "#f6f5f7" }}>{name}</p>
                  <p style={{ fontSize: 11, color: "rgba(246,245,247,0.42)" }}>{cargo}</p>
                </div>
              </div>
              {propName && (
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center rounded-lg flex-shrink-0"
                    style={{
                      width: 32,
                      height: 32,
                      background: "rgba(76,214,160,0.10)",
                      border: "1px solid rgba(76,214,160,0.20)",
                    }}
                  >
                    <Building className="h-4 w-4" style={{ color: "#4cd6a0" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "#f6f5f7" }}>{propName}</p>
                    <p style={{ fontSize: 11, color: "rgba(246,245,247,0.42)" }}>{propCity || "Sin ciudad"} &mdash; {propUnits || "?"} unidades</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div
                className="rounded-xl px-4 py-3 mb-4"
                style={{
                  background: "rgba(255,111,111,0.10)",
                  border: "1px solid rgba(255,111,111,0.25)",
                }}
              >
                <p style={{ fontSize: 13, color: "#ff6f6f" }}>{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                className="flex items-center gap-2 rounded-xl px-5 py-3 transition-all duration-150 hover:opacity-80 active:scale-[0.98] cursor-pointer"
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(246,245,247,0.66)",
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Atras
              </button>
              <button
                onClick={handleFinish}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl px-6 py-3 transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, #7c5cff 0%, #5a3cf0 100%)",
                  boxShadow: "0 4px 20px rgba(124,92,255,0.25)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#fff",
                }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Ir al Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p
          className="text-center"
          style={{
            fontFamily: "'Geist Mono', ui-monospace, monospace",
            fontSize: 9,
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            color: "rgba(246,245,247,0.15)",
            userSelect: "none",
          }}
        >
          SOPH.IA &middot; Propiedad Horizontal
        </p>
      </div>
    </div>
  );
}
