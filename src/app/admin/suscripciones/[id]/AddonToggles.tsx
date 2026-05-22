"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const ADDONS = [
  { id: "metra", name: "Metra", description: "Análisis financiero" },
  { id: "nomethes", name: "Nomethes", description: "Normativa PH" },
  { id: "hermes", name: "Hermes", description: "Comunicaciones" },
  { id: "logistes", name: "Logistes", description: "Logística operativa" },
] as const;

interface Props {
  subscriptionId: string;
  initialAddons: string[];
  planId: string | null | undefined;
}

export function AddonToggles({ subscriptionId, initialAddons, planId }: Props) {
  const router = useRouter();
  const [addons, setAddons] = useState<string[]>(initialAddons);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const baseMrr = planId === "elite" ? 200 : planId === "pro" ? 20 : 0;
  const totalMrr = baseMrr + addons.length * 5;

  async function toggle(addonId: string) {
    const next = addons.includes(addonId)
      ? addons.filter((a) => a !== addonId)
      : [...addons, addonId];

    setAddons(next);
    setError(null);

    const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addonAgents: next }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Error al actualizar.");
      setAddons(addons); // revert
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3">
      {ADDONS.map((addon) => {
        const active = addons.includes(addon.id);
        return (
          <div
            key={addon.id}
            className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0"
          >
            <div>
              <p className="text-[13px] font-medium text-foreground">{addon.name}</p>
              <p className="text-[11px] text-muted-foreground/60">{addon.description}</p>
            </div>
            <button
              onClick={() => toggle(addon.id)}
              disabled={isPending}
              aria-label={`Activar/desactivar ${addon.name}`}
              className="relative inline-flex h-5 w-9 items-center rounded-full border transition-all duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff]/50"
              style={{
                background: active
                  ? "#7c5cff"
                  : "rgba(255,255,255,0.08)",
                borderColor: active
                  ? "rgba(124,92,255,0.60)"
                  : "rgba(255,255,255,0.12)",
              }}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200"
                style={{ transform: active ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        );
      })}

      {/* MRR breakdown */}
      <div
        className="mt-3 rounded-xl border border-border px-4 py-3"
        style={{ background: "rgba(255,255,255,0.02)" }}
      >
        <p
          className="text-[9.5px] uppercase text-muted-foreground/60 mb-2"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
        >
          MRR estimado
        </p>
        <div className="space-y-1">
          <div className="flex justify-between text-[12px]">
            <span className="text-muted-foreground">
              Plan {planId === "elite" ? "Elite" : planId === "pro" ? "Pro" : "—"}
            </span>
            <span
              className="font-medium"
              style={{ fontFamily: "var(--font-mono)", color: "#4cd6a0" }}
            >
              ${baseMrr}
            </span>
          </div>
          {addons.length > 0 && (
            <div className="flex justify-between text-[12px]">
              <span className="text-muted-foreground">
                {addons.length} add-on{addons.length !== 1 ? "s" : ""} × $5
              </span>
              <span
                className="font-medium"
                style={{ fontFamily: "var(--font-mono)", color: "#9a7fff" }}
              >
                ${addons.length * 5}
              </span>
            </div>
          )}
          <div className="flex justify-between text-[13px] font-semibold pt-1.5 border-t border-border mt-1.5">
            <span className="text-foreground">Total / mes</span>
            <span style={{ fontFamily: "var(--font-mono)", color: "#4cd6a0" }}>
              ${totalMrr}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-[#ff6f6f]">{error}</p>
      )}
    </div>
  );
}
