"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useTransition, useRef } from "react";
import { Search } from "lucide-react";

interface Props {
  defaultQ: string;
  defaultRole: string;
  defaultPlanStatus: string;
}

export function UsuariosFilters({ defaultQ, defaultRole, defaultPlanStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const push = useCallback(
    (q: string, role: string, planStatus: string) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (role !== "all") params.set("role", role);
      if (planStatus !== "all") params.set("planStatus", planStatus);
      // reset page on filter change
      const url = `${pathname}${params.toString() ? `?${params}` : ""}`;
      startTransition(() => router.push(url));
    },
    [router, pathname]
  );

  const handleQ = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      push(value, defaultRole, defaultPlanStatus);
    }, 400);
  };

  const handleRole = (value: string) => push(defaultQ, value, defaultPlanStatus);
  const handlePlanStatus = (value: string) => push(defaultQ, defaultRole, value);

  const selectBase =
    "rounded-lg border border-border bg-card text-sm text-foreground px-3 h-9 focus-visible:outline-none focus-visible:border-[#7c5cff] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,92,255,0.15)] transition-all cursor-pointer";

  return (
    <div
      className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border border-border"
      style={{ background: "rgba(255,255,255,0.02)" }}
    >
      {/* Search */}
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

      {/* Role */}
      <select
        defaultValue={defaultRole}
        onChange={(e) => handleRole(e.target.value)}
        className={selectBase}
      >
        <option value="all">Todos los roles</option>
        <option value="user">Usuario</option>
        <option value="admin">Admin</option>
      </select>

      {/* Plan status */}
      <select
        defaultValue={defaultPlanStatus}
        onChange={(e) => handlePlanStatus(e.target.value)}
        className={selectBase}
      >
        <option value="all">Cualquier estado</option>
        <option value="active">Activa</option>
        <option value="inactive">Inactiva</option>
        <option value="past_due">Past due</option>
        <option value="canceled">Cancelada</option>
        <option value="no_sub">Sin suscripción</option>
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
