"use client";

import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";

interface Props {
  status?: string;
  priority?: string;
  category?: string;
  assigned?: string;
  q?: string;
}

export function TicketsFilters({ status, priority, category, assigned, q }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nav = useCallback(
    (overrides: Record<string, string | undefined>) => {
      const merged: Record<string, string | undefined> = { status, priority, category, assigned, q, ...overrides };
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(merged)) {
        if (v && v !== "all") p.set(k, v);
      }
      const s = p.toString();
      startTransition(() => router.push(`/admin/tickets${s ? `?${s}` : ""}`));
    },
    [router, status, priority, category, assigned, q]
  );

  const selectStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    background: "var(--card)",
    border: "1px solid var(--border)",
    color: "rgba(255,255,255,0.55)",
    outline: "none",
  };
  const cls = "h-8 px-3 rounded-lg text-[11px] cursor-pointer transition-colors";

  return (
    <>
      <select
        defaultValue={priority || "all"}
        onChange={(e) => nav({ priority: e.target.value })}
        className={cls}
        style={selectStyle}
      >
        <option value="all">Prioridad: Todas</option>
        <option value="low">Baja</option>
        <option value="normal">Normal</option>
        <option value="high">Alta</option>
        <option value="urgent">Urgente</option>
      </select>

      <select
        defaultValue={category || "all"}
        onChange={(e) => nav({ category: e.target.value })}
        className={cls}
        style={selectStyle}
      >
        <option value="all">Categoría: Todas</option>
        <option value="general">General</option>
        <option value="billing">Facturación</option>
        <option value="technical">Técnico</option>
        <option value="feature">Función</option>
        <option value="bug">Bug</option>
      </select>

      <select
        defaultValue={assigned || "all"}
        onChange={(e) => nav({ assigned: e.target.value })}
        className={cls}
        style={selectStyle}
      >
        <option value="all">Asignado: Todos</option>
        <option value="unassigned">Sin asignar</option>
        <option value="mine">Míos</option>
      </select>

      {isPending && (
        <span className="text-[10px] text-muted-foreground/50" style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}>
          Cargando…
        </span>
      )}
    </>
  );
}
