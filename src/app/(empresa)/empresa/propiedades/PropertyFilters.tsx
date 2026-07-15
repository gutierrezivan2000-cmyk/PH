"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition, useRef } from "react";
import { Search } from "lucide-react";

interface Props {
  defaultQ: string;
  defaultGroup: string;
  defaultReporte: string;
  defaultSort: string;
  groups: string[];
}

export function PropertyFilters({ defaultQ, defaultGroup, defaultReporte, defaultSort, groups }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (q: string, group: string, reporte: string, sort: string) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (group !== "all") params.set("group", group);
      if (reporte !== "all") params.set("reporte", reporte);
      if (sort !== "recent") params.set("sort", sort);
      const url = `${pathname}${params.toString() ? `?${params}` : ""}`;
      startTransition(() => router.push(url));
    },
    [router, pathname]
  );

  const handleQ = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      push(value, defaultGroup, defaultReporte, defaultSort);
    }, 400);
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
          placeholder="Buscar por nombre o ciudad…"
          className="w-full h-9 rounded-lg border border-border bg-card text-sm text-foreground pl-8 pr-3 placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:border-[#7c5cff] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,92,255,0.15)] transition-all"
        />
      </div>

      {groups.length > 0 && (
        <select
          defaultValue={defaultGroup}
          onChange={(e) => push(defaultQ, e.target.value, defaultReporte, defaultSort)}
          className={selectBase}
        >
          <option value="all">Todos los grupos</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      )}

      <select
        defaultValue={defaultReporte}
        onChange={(e) => push(defaultQ, defaultGroup, e.target.value, defaultSort)}
        className={selectBase}
      >
        <option value="all">Cualquier estado</option>
        <option value="con">Con informe reciente (30d)</option>
        <option value="sin">Sin informe reciente (30d)</option>
      </select>

      <select
        defaultValue={defaultSort}
        onChange={(e) => push(defaultQ, defaultGroup, defaultReporte, e.target.value)}
        className={selectBase}
      >
        <option value="recent">Más recientes</option>
        <option value="name">Nombre (A–Z)</option>
        <option value="units">Más unidades</option>
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
