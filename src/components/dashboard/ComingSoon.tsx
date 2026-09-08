"use client";

import Link from "next/link";
import { Sparkles, ArrowLeft, type LucideIcon } from "lucide-react";
import { Surface, MonoLabel } from "@/components/ui/surface";

/**
 * Reemplaza el contenido de una página pausada. Deliberadamente NO toca la
 * ruta ni sus APIs — solo lo que se renderiza — para que reactivarla más
 * adelante sea con retirar un `if` en la página, no reconstruir nada.
 */
export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-[720px] mx-auto">
      <Surface className="ui-rise px-8 py-14 text-center">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "var(--hifi-accent-soft)", border: "1px solid var(--hifi-accent-line)" }}
        >
          <Icon className="h-6 w-6" style={{ color: "var(--hifi-accent-hi)" }} />
        </div>
        <MonoLabel className="inline-flex items-center gap-1.5 justify-center mb-3" style={{ color: "var(--hifi-accent-hi)" }}>
          <Sparkles className="h-3 w-3" />
          Próximamente
        </MonoLabel>
        <h2 className="text-[19px] font-semibold mb-2" style={{ color: "var(--ink)" }}>
          {title}
        </h2>
        <p className="text-[13.5px] leading-relaxed mb-7 max-w-[440px] mx-auto" style={{ color: "var(--ink-2)" }}>
          {description}
        </p>
        <Link
          href="/dashboard"
          className="ui-press inline-flex items-center gap-2 rounded-full text-[12.5px] font-medium px-4 py-2 cursor-pointer"
          style={{ background: "rgb(var(--veil-rgb) / 0.06)", color: "var(--ink-2)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al inicio
        </Link>
      </Surface>
    </div>
  );
}
