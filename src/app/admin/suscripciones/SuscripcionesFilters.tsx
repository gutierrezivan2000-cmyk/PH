"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition, useRef } from "react";
import { Search } from "lucide-react";

interface Props {
  defaultQ: string;
  defaultStatus: string;
}

export function SuscripcionesFilters({ defaultQ, defaultStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (q: string, status: string) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status !== "all") params.set("status", status);
      startTransition(() =>
        router.push(`${pathname}${params.toString() ? `?${params}` : ""}`)
      );
    },
    [router, pathname]
  );

  const handleQ = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => push(value, defaultStatus), 400);
  };

  const selectBase =
    "rounded-lg border border-border bg-card text-sm text-foreground px-3 h-9 focus-visible:outline-none focus-visible:border-[#7c5cff] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,92,255,0.15)] transition-all cursor-pointer";

  return (
    <div
      className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border border-border"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 pointer-events-none"
          style={{ color: "rgba(255,255,255,0.35)" }}
        />
        <input
          type="search"
          defaultValue={defaultQ}
          onChange={(e) => handleQ(e.target.value)}
          placeholder="Buscar por email o nombre…"
          className="w-full h-9 rounded-lg border border-border bg-card text-sm text-foreground pl-8 pr-3 placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-[#7c5cff] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,92,255,0.15)] transition-all"
        />
      </div>

      <select
        defaultValue={defaultStatus}
        onChange={(e) => push(defaultQ, e.target.value)}
        className={selectBase}
      >
        <option value="all">Todos los estados</option>
        <option value="active">Activa</option>
        <option value="past_due">Past due</option>
        <option value="canceled">Cancelada</option>
        <option value="inactive">Inactiva</option>
      </select>

      {isPending && (
        <span
          className="text-[10px] text-muted-foreground/50 ml-auto"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em" }}
        >
          Cargando…
        </span>
      )}
    </div>
  );
}
