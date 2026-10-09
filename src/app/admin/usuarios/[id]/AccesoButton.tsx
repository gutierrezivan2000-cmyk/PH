"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";

const PLANES = [
  { id: "pro", nombre: "Pro" },
  { id: "business", nombre: "Business" },
  { id: "elite", nombre: "Elite" },
];

/** Da acceso a un plan por N días (cortesía del administrador; queda en la auditoría). */
export function AccesoButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [planId, setPlanId] = useState("pro");
  const [dias, setDias] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function dar() {
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/acceso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, dias }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo dar el acceso.");
        return;
      }
      setAbierto(false);
      startTransition(() => router.refresh());
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAbierto(true)} className="gap-2">
        <KeyRound className="h-3.5 w-3.5" />
        Dar acceso
      </Button>
    );
  }

  const campo = "rounded-lg border border-border bg-card text-sm text-foreground px-3 h-9";
  return (
    <div className="flex flex-col items-end gap-2 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={campo} aria-label="Plan">
          {PLANES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          Días
          <input
            type="number"
            min={1}
            max={365}
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className={`${campo} w-20`}
          />
        </label>
        <Button size="sm" onClick={dar} disabled={enviando}>
          {enviando ? "Dando…" : "Confirmar"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAbierto(false)} disabled={enviando}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}
    </div>
  );
}
