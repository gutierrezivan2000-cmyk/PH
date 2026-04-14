"use client";

import Link from "next/link";
import {
  FileText,
  Sparkles,
  Upload,
  Download,
  Shield,
  History,
  Presentation,
  FileSpreadsheet,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Brain,
} from "lucide-react";
import { useState } from "react";

const FEATURES = [
  {
    icon: FileText,
    title: "Informes de Gestion",
    desc: "Genera informes mensuales completos con KPIs, semaforos de cumplimiento, tablas financieras y conclusiones ejecutivas.",
    color: "from-violet-500 to-purple-600",
    bg: "bg-violet-500/10",
  },
  {
    icon: Shield,
    title: "Actas del Consejo",
    desc: "Actas legales conforme a la Ley 675 de 2001, con estructura institucional, registro de votaciones y espacio de firmas.",
    color: "from-emerald-500 to-teal-600",
    bg: "bg-emerald-500/10",
  },
  {
    icon: Presentation,
    title: "Presentaciones PPTX",
    desc: "Presentaciones listas para la asamblea con diapositivas profesionales generadas automaticamente desde el informe.",
    color: "from-blue-500 to-indigo-600",
    bg: "bg-blue-500/10",
  },
  {
    icon: Upload,
    title: "Procesamiento de Archivos",
    desc: "Sube PDF, Excel, Word, imagenes y audios. SOPH.IA extrae y analiza toda la informacion automaticamente.",
    color: "from-amber-500 to-orange-600",
    bg: "bg-amber-500/10",
  },
  {
    icon: Brain,
    title: "Marco Legal Integrado",
    desc: "Ley 675/2001, Ley 1801/2016, Habeas Data y normativa colombiana integrada en cada documento generado.",
    color: "from-rose-500 to-pink-600",
    bg: "bg-rose-500/10",
  },
  {
    icon: History,
    title: "Historial Completo",
    desc: "Todos tus documentos organizados por propiedad y periodo. Acceso inmediato a cualquier generacion anterior.",
    color: "from-cyan-500 to-blue-600",
    bg: "bg-cyan-500/10",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Sube tu informacion",
    desc: "Carga textos, fotos, audios, Excel, PDF o Word con la informacion del mes.",
    icon: Upload,
  },
  {
    num: "02",
    title: "SOPH.IA analiza y genera",
    desc: "La IA procesa toda la informacion y redacta documentos profesionales con marco legal.",
    icon: Sparkles,
  },
  {
    num: "03",
    title: "Descarga tus documentos",
    desc: "Obtene informe PDF, acta legal y presentacion PPTX listos para entregar.",
    icon: Download,
  },
];

const FAQS = [
  {
    q: "Que tipo de documentos genera SOPH.IA?",
    a: "SOPH.IA genera tres tipos de documentos: Informes de Gestion mensuales con KPIs y semaforos, Actas del Consejo de Administracion conforme a la Ley 675 de 2001, y Presentaciones PPTX profesionales listas para asamblea.",
  },
  {
    q: "Es legalmente valido el contenido generado?",
    a: "SOPH.IA genera documentos con estructura legal colombiana y referencias a la Ley 675 de 2001, pero los documentos deben ser revisados y firmados por las personas autorizadas. La IA es una herramienta de redaccion, no un sustituto de la validacion juridica.",
  },
  {
    q: "Que formatos de archivo puedo subir?",
    a: "Puedes subir PDF, Word (.docx), Excel (.xlsx, .csv), imagenes (.jpg, .png), archivos de texto (.txt) y audios (.mp3, .wav, .m4a). SOPH.IA extrae y procesa la informacion de cada formato automaticamente.",
  },
  {
    q: "Cuanto tiempo tarda en generar los documentos?",
    a: "La generacion completa (informe + acta + presentacion) tarda entre 1 y 3 minutos dependiendo del volumen de informacion. Puedes generar documentos individuales para mayor velocidad.",
  },
  {
    q: "Puedo usar SOPH.IA para varias propiedades?",
    a: "Si, puedes registrar multiples propiedades en tu cuenta y generar documentos independientes para cada una. El historial se organiza por propiedad y periodo.",
  },
  {
    q: "Mis datos estan seguros?",
    a: "Toda la informacion se transmite cifrada, se almacena en servidores seguros y solo tu tienes acceso a tus documentos. No compartimos datos con terceros.",
  },
];

const PLAN_FEATURES = [
  "Informes de Gestion ilimitados",
  "Actas del Consejo ilimitadas",
  "Presentaciones PPTX",
  "Procesamiento de archivos (PDF, Excel, Word)",
  "Marco legal colombiano integrado",
  "Historial completo de documentos",
  "Soporte por WhatsApp",
  "Propiedades ilimitadas",
];

export default function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-[#0a0a1a] text-white overflow-hidden">
      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 w-full z-50 liquid-glass-dark">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Sparkles className="h-4.5 w-4.5 text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight">
              SOPH<span className="text-white/50">.</span><span className="bg-gradient-to-r from-amber-300 to-yellow-200 bg-clip-text text-transparent">IA</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/70 hover:text-white transition-colors hidden sm:block">
              Iniciar Sesion
            </Link>
            <Link
              href="/login"
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-sm font-semibold hover:shadow-lg hover:shadow-violet-500/30 transition-all hover:-translate-y-0.5"
            >
              Comenzar
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-32 pb-24 px-6">
        {/* Background orbs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-violet-600/15 blur-[150px] animate-orb" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-indigo-500/15 blur-[130px] animate-orb-delayed" />
        <div className="absolute top-1/3 right-0 w-[300px] h-[300px] rounded-full bg-purple-500/10 blur-[100px] animate-orb-slow" />

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full liquid-glass text-sm font-medium text-white/80 mb-8">
            <Zap className="h-4 w-4 text-amber-400" />
            Potenciado por Inteligencia Artificial
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
            Documentos{" "}
            <span className="bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
              profesionales
            </span>
            <br />
            en minutos, no en horas
          </h1>

          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            SOPH.IA genera informes de gestion, actas legales y presentaciones
            para administradores de propiedad horizontal con inteligencia artificial.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="group px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-base font-bold hover:shadow-2xl hover:shadow-violet-500/30 transition-all hover:-translate-y-1 flex items-center gap-2"
            >
              Comenzar Gratis
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#como-funciona"
              className="px-8 py-4 rounded-2xl liquid-glass text-base font-semibold hover:bg-white/20 transition-all flex items-center gap-2"
            >
              Ver como funciona
            </a>
          </div>

          {/* Hero glass card mockup */}
          <div className="mt-16 mx-auto max-w-3xl liquid-glass rounded-3xl p-1">
            <div className="bg-gradient-to-br from-violet-900/40 to-indigo-900/40 rounded-[22px] p-8 sm:p-12">
              <div className="grid sm:grid-cols-3 gap-6 text-center">
                {[
                  { label: "Informe PDF", icon: FileText, color: "text-violet-400" },
                  { label: "Acta Legal", icon: Shield, color: "text-emerald-400" },
                  { label: "Presentacion PPTX", icon: Presentation, color: "text-blue-400" },
                ].map((item) => (
                  <div key={item.label} className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl liquid-glass flex items-center justify-center">
                      <item.icon className={`h-7 w-7 ${item.color}`} />
                    </div>
                    <span className="text-sm font-medium text-white/70">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full w-3/4 bg-gradient-to-r from-violet-500 to-purple-500 rounded-full animate-pulse" />
              </div>
              <p className="text-xs text-white/40 mt-3 text-center">Generando documentos profesionales...</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="py-16 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-white/40 text-sm font-medium tracking-wider uppercase mb-8">
            La herramienta inteligente para administradores de propiedad horizontal
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[
              { value: "3", label: "Documentos generados" },
              { value: "<3min", label: "Tiempo promedio" },
              { value: "100%", label: "Marco legal Col." },
              { value: "24/7", label: "Disponibilidad" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-extrabold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-sm text-white/50 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="como-funciona" className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-violet-400 text-sm font-semibold tracking-wider uppercase mb-3">Como funciona</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Tres pasos. Documentos perfectos.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.num} className="liquid-glass rounded-2xl p-8 hover:bg-white/[0.15] transition-all group">
                <span className="text-5xl font-extrabold text-white/10 group-hover:text-violet-500/30 transition-colors">
                  {step.num}
                </span>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center mt-4 mb-4">
                  <step.icon className="h-6 w-6 text-violet-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">{step.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-violet-400 text-sm font-semibold tracking-wider uppercase mb-3">Funcionalidades</p>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Todo lo que necesitas en un solo lugar
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="liquid-glass rounded-2xl p-7 hover:bg-white/[0.15] transition-all group">
                <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <f.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-violet-950/20 to-transparent" />
        <div className="relative max-w-lg mx-auto text-center">
          <p className="text-violet-400 text-sm font-semibold tracking-wider uppercase mb-3">Precio</p>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Simple y accesible
          </h2>
          <p className="text-white/50 mb-12">Un solo plan con todo incluido. Sin sorpresas.</p>

          <div className="liquid-glass rounded-3xl p-8 sm:p-10 text-left">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-5xl font-extrabold">$20</span>
              <span className="text-white/50">USD / mes</span>
            </div>
            <p className="text-white/40 text-sm mb-8">Todo incluido. Cancela cuando quieras.</p>

            <ul className="space-y-3 mb-8">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                    <Check className="h-3 w-3 text-violet-400" />
                  </div>
                  <span className="text-white/70">{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href="/login"
              className="block w-full text-center px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-base font-bold hover:shadow-2xl hover:shadow-violet-500/30 transition-all hover:-translate-y-1"
            >
              Comenzar Ahora
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-violet-400 text-sm font-semibold tracking-wider uppercase mb-3">Preguntas frecuentes</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Resolvemos tus dudas
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="liquid-glass rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-left hover:bg-white/5 transition-colors"
                >
                  <span className="font-semibold text-sm pr-4">{faq.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="h-5 w-5 text-white/40 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-white/40 flex-shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5">
                    <p className="text-white/50 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-violet-950/30 to-transparent" />
        <div className="relative max-w-3xl mx-auto text-center">
          <div className="liquid-glass rounded-3xl p-10 sm:p-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-violet-500/30">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              Transforma tu administracion hoy
            </h2>
            <p className="text-white/50 max-w-lg mx-auto mb-8 leading-relaxed">
              Unete a los administradores que ya generan documentos profesionales
              en minutos con inteligencia artificial.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-base font-bold hover:shadow-2xl hover:shadow-violet-500/30 transition-all hover:-translate-y-1"
            >
              Comenzar Gratis
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-10 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold tracking-tight">
              SOPH<span className="text-white/50">.</span><span className="bg-gradient-to-r from-amber-300 to-yellow-200 bg-clip-text text-transparent">IA</span>
            </span>
          </div>
          <p className="text-white/30 text-sm">
            &copy; {new Date().getFullYear()} SOPH.IA. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
