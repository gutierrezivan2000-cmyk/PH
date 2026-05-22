"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldX } from "lucide-react";

interface Props {
  userId: string;
  currentRole: string;
  isSelf: boolean;
}

export function RoleButton({ userId, currentRole, isSelf }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isAdmin = currentRole === "admin";
  const targetRole = isAdmin ? "user" : "admin";

  async function handleClick() {
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: targetRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Error al cambiar el rol.");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (isSelf) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[12px] text-muted-foreground/50 cursor-not-allowed"
        title="No puedes cambiar tu propio rol"
      >
        <ShieldX className="h-3.5 w-3.5" />
        No puedes cambiar tu propio rol
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        variant={isAdmin ? "outline" : "default"}
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="gap-2"
        style={!isAdmin ? { background: "#7c5cff" } : undefined}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        {isPending
          ? "Guardando…"
          : isAdmin
          ? "Quitar admin"
          : "Promover a admin"}
      </Button>
      {error && (
        <p className="text-[11px] text-[#ff6f6f]">{error}</p>
      )}
    </div>
  );
}
