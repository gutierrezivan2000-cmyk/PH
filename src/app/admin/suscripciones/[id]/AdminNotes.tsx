"use client";

import { useState, useTransition } from "react";

interface Props {
  subscriptionId: string;
  initialNotes: string | null | undefined;
}

export function AdminNotes({ subscriptionId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes || "");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminNotes: notes }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al guardar.");
      return;
    }
    setSaved(true);
    startTransition(() => {
      // No router.refresh needed — notes don't affect server-rendered data
    });
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="space-y-3">
      <textarea
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          setSaved(false);
        }}
        onBlur={save}
        placeholder="Notas internas del administrador…"
        rows={8}
        className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus-visible:outline-none focus-visible:border-[#7c5cff] focus-visible:ring-[3px] focus-visible:ring-[rgba(124,92,255,0.15)] transition-all"
        style={{ fontFamily: "var(--font-mono)", fontSize: "12px", lineHeight: "1.6" }}
      />
      <div className="flex items-center justify-between">
        {error && <p className="text-[11px] text-[#ff6f6f]">{error}</p>}
        {saved && (
          <p
            className="text-[11px] text-[#4cd6a0]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            ✓ Guardado
          </p>
        )}
        <button
          onClick={save}
          disabled={isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
        >
          {isPending ? "Guardando…" : "Guardar nota"}
        </button>
      </div>
    </div>
  );
}
