import Link from "next/link";
import { ArrowLeft, TriangleAlert, type LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Shared hi-fi shell for SOPH.IA public legal pages (server-only).    */
/* ------------------------------------------------------------------ */

const MONO_LABEL: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

export function TopBar() {
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(10,10,10,0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderColor: "rgba(255,255,255,0.07)",
      }}
    >
      <div className="mx-auto max-w-3xl px-5 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #7c5cff, #5a3cf0)",
              boxShadow: "0 0 24px rgba(124,92,255,0.35)",
            }}
          >
            S
          </div>
          <span
            className="text-[15px] font-medium tracking-[-0.025em]"
            style={{ color: "#f6f5f7" }}
          >
            SOPH.<span style={{ color: "#9a7fff" }}>IA</span>
          </span>
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] transition-colors hover:text-white"
          style={{ color: "rgba(246,245,247,0.66)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al inicio
        </Link>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer
      className="border-t py-8"
      style={{ borderColor: "rgba(255,255,255,0.07)" }}
    >
      <p
        className="text-center"
        style={{ ...MONO_LABEL, color: "rgba(246,245,247,0.42)" }}
      >
        SOPH.IA © 2026 · Propiedad Horizontal · Colombia
      </p>
    </footer>
  );
}

export function LegalPage({
  eyebrow,
  title,
  intro,
  disclaimer,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  disclaimer?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#0a0a0a", color: "#f6f5f7" }}
    >
      <TopBar />

      <main className="flex-1 w-full mx-auto max-w-3xl px-5 pt-14 pb-20">
        {/* Hero */}
        <p style={{ ...MONO_LABEL, fontSize: 11, color: "#9a7fff" }}>
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-medium tracking-[-0.025em]">
          {title}
        </h1>
        <p
          className="mt-4 text-[14px] leading-relaxed max-w-2xl"
          style={{ color: "rgba(246,245,247,0.66)" }}
        >
          {intro}
        </p>

        {disclaimer && (
          <div
            className="mt-8 flex items-start gap-3 rounded-2xl border px-4 py-3.5"
            style={{
              background: "rgba(245,158,11,0.07)",
              borderColor: "rgba(245,158,11,0.25)",
            }}
          >
            <TriangleAlert
              className="h-4 w-4 flex-shrink-0 mt-0.5"
              style={{ color: "#f5c97b" }}
            />
            <p className="text-[12.5px] leading-relaxed" style={{ color: "#f5c97b" }}>
              Documento de referencia. Consulte a su asesor legal para
              validación.
            </p>
          </div>
        )}

        <div className="mt-10 space-y-5">{children}</div>
      </main>

      <Footer />
    </div>
  );
}

export function Section({
  number,
  title,
  icon: Icon,
  children,
}: {
  number: string;
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-6 sm:p-7"
      style={{ background: "#15151a", borderColor: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "#1d1d24", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <Icon className="h-4 w-4" style={{ color: "#9a7fff" }} />
        </div>
        <div>
          <p style={{ ...MONO_LABEL, color: "rgba(246,245,247,0.42)" }}>
            Sección {number}
          </p>
          <h2 className="text-[16px] font-medium tracking-[-0.025em] mt-0.5">
            {title}
          </h2>
        </div>
      </div>
      <div
        className="space-y-3 text-[13.5px] leading-relaxed"
        style={{ color: "rgba(246,245,247,0.66)" }}
      >
        {children}
      </div>
    </section>
  );
}

export function Item({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-[7px] h-1.5 w-1.5 rounded-full flex-shrink-0"
        style={{ background: "#7c5cff" }}
      />
      <span>{children}</span>
    </li>
  );
}
