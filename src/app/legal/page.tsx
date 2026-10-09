import type { Metadata } from "next";
import Link from "next/link";
import { Scale } from "lucide-react";
import { LegalPage } from "./legal-shell";
import { DOCUMENTOS_LEGALES } from "@/lib/legal/empresa";
import { LEGAL_FECHA_TEXTO } from "@/lib/legal/empresa";

export const metadata: Metadata = {
  title: "Documentos legales — SOPH.IA",
  description: "Términos, privacidad, habeas data, reuniones, encargado del tratamiento, inteligencia artificial y cookies de SOPH.IA.",
};

export default function LegalIndexPage() {
  return (
    <LegalPage
      eyebrow={`Legal · Versión vigente desde el ${LEGAL_FECHA_TEXTO}`}
      title="Documentos legales"
      intro="Todo lo que regula el uso de SOPH.IA y el tratamiento de tus datos, en un solo lugar."
    >
      <ul className="grid gap-3">
        {DOCUMENTOS_LEGALES.map((d) => (
          <li key={d.ruta}>
            <Link
              href={d.ruta}
              className="flex items-start gap-3 rounded-2xl border p-5 transition-colors hover:opacity-90"
              style={{ background: "var(--surface-2)", borderColor: "rgb(var(--veil-rgb) / 0.07)" }}
            >
              <Scale className="h-4 w-4 mt-1 flex-shrink-0" style={{ color: "var(--accent-text)" }} />
              <span>
                <span className="block text-[15px] font-medium" style={{ color: "var(--ink)" }}>{d.titulo}</span>
                <span className="block text-[13px] mt-1" style={{ color: "var(--ink-2)" }}>{d.resumen}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </LegalPage>
  );
}
