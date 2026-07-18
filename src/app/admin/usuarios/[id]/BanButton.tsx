"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Ban, ShieldCheck, X } from "lucide-react";

interface Props {
  userId: string;
  banned: boolean;
  isSelf: boolean;
}

export function BanButton({ userId, banned, isSelf }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function apply(nextBanned: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          banned: nextBanned,
          reason: nextBanned ? reason : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo completar la acción.");
        return;
      }
      setConfirming(false);
      setReason("");
      startTransition(() => router.refresh());
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isSelf) return null;

  // Already banned → single "unban" button.
  if (banned) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => apply(false)}
          disabled={submitting || isPending}
          className="gap-2"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          {submitting || isPending ? "Reactivando…" : "Reactivar acceso"}
        </Button>
        {error && <p className="text-[11px] text-[#ff6f6f]">{error}</p>}
      </div>
    );
  }

  // Not banned → confirm flow with an optional reason.
  if (!confirming) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
        className="gap-2 border-[rgba(255,111,111,0.35)] text-[#ff8585] hover:bg-[rgba(255,111,111,0.08)]"
      >
        <Ban className="h-3.5 w-3.5" />
        Banear usuario
      </Button>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border p-3 w-full sm:w-[320px]"
      style={{
        background: "rgba(255,111,111,0.06)",
        borderColor: "rgba(255,111,111,0.25)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium text-[#ff8585]">
          Banear a este usuario
        </p>
        <button
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          className="text-muted-foreground/60 hover:text-foreground"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/70 leading-snug">
        No podrá iniciar sesión y su sesión activa se cerrará en pocos minutos.
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        className="h-8 px-2.5 rounded-lg border bg-background text-[12px] focus:outline-none"
        style={{ borderColor: "rgba(255,255,255,0.12)" }}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => apply(true)}
          disabled={submitting}
          className="gap-2 flex-1"
          style={{ background: "#e5484d" }}
        >
          <Ban className="h-3.5 w-3.5" />
          {submitting ? "Baneando…" : "Confirmar ban"}
        </Button>
      </div>
      {error && <p className="text-[11px] text-[#ff6f6f]">{error}</p>}
    </div>
  );
}
