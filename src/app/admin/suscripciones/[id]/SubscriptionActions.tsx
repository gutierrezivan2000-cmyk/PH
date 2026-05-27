"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { X, AlertTriangle } from "lucide-react";

interface Props {
  subscriptionId: string;
  status: string;
}

export function SubscriptionActions({ subscriptionId, status }: Props) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleCancel() {
    setError(null);
    const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "canceled" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al cancelar.");
      return;
    }
    setShowConfirm(false);
    if (data.epaycoCancel?.note) setNotice(data.epaycoCancel.note);
    startTransition(() => router.refresh());
  }

  async function handleReactivate() {
    setError(null);
    const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al reactivar.");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {error && (
          <span className="text-[11px] text-[#ff6f6f]">{error}</span>
        )}
        {notice && (
          <span className="text-[11px] text-[#ffb958] max-w-xs">{notice}</span>
        )}
        {status === "canceled" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReactivate}
            disabled={isPending}
            className="border border-border"
          >
            {isPending ? "Reactivando…" : "Reactivar"}
          </Button>
        )}
        {status !== "canceled" && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
          >
            Cancelar suscripción
          </Button>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6"
            style={{
              background:
                "radial-gradient(120% 100% at 50% 0%, rgba(255,111,111,0.06), transparent 60%), var(--card)",
            }}
          >
            <button
              onClick={() => setShowConfirm(false)}
              className="absolute right-4 top-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: "rgba(255,111,111,0.12)", color: "#ff6f6f" }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>

            <h2 className="text-[16px] font-semibold text-foreground mb-2">
              ¿Cancelar suscripción?
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Intentaremos cancelar el cobro recurrente en ePayco si hay una
              suscripción vinculada. Si el checkout fue de pago único (onpage),
              deberás confirmarlo manualmente en el panel de ePayco — te lo
              indicaremos tras confirmar.
            </p>

            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
              >
                {isPending ? "Cancelando…" : "Confirmar cancelación"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
