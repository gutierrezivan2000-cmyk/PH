"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2 } from "lucide-react";

interface AdminTicketActionsProps {
  ticketId: string;
  currentStatus: string;
  currentPriority: string;
  currentCategory: string;
  adminId: string;
  isAssigned: boolean;
  isAssignedToMe: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Abierto",
  pending: "Pendiente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

const monoSmall: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

export function AdminTicketActions({
  ticketId,
  currentStatus,
  currentPriority,
  currentCategory,
  adminId,
  isAssigned,
  isAssignedToMe,
}: AdminTicketActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setLoading(true);
    try {
      await fetch(`/api/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
      {loading && (
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: "rgba(255,255,255,0.40)" }} />
      )}

      {/* Assign to me */}
      {!isAssignedToMe && (
        <button
          onClick={() => patch({ assignedTo: adminId })}
          disabled={loading}
          className="h-8 px-3 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50"
          style={{
            ...monoSmall,
            background: "rgba(124,92,255,0.10)",
            border: "1px solid rgba(124,92,255,0.25)",
            color: "#9a7fff",
          }}
        >
          Asignar a mí
        </button>
      )}

      {/* Status dropdown */}
      <select
        value={currentStatus}
        onChange={(e) => patch({ status: e.target.value })}
        disabled={loading}
        className="h-8 px-2 rounded-lg text-[11px] cursor-pointer disabled:opacity-50 transition-colors"
        style={{
          ...monoSmall,
          background: "var(--secondary)",
          border: "1px solid var(--border)",
          color: "var(--foreground)",
          outline: "none",
        }}
      >
        <option value="open">Abierto</option>
        <option value="pending">Pendiente</option>
        <option value="resolved">Resuelto</option>
        <option value="closed">Cerrado</option>
      </select>

      {/* Resolve fast-path */}
      {currentStatus === "open" && (
        <button
          onClick={() => patch({ status: "resolved" })}
          disabled={loading}
          className="h-8 px-3 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          style={{
            ...monoSmall,
            background: "rgba(76,214,160,0.10)",
            border: "1px solid rgba(76,214,160,0.25)",
            color: "#4cd6a0",
          }}
        >
          <CheckCircle className="h-3.5 w-3.5" />
          Resolver
        </button>
      )}
    </div>
  );
}
