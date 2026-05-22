"use client";

import { useEffect, useState, useTransition } from "react";
import { AdminGate } from "@/components/admin/AdminGate";
import { PageHeader } from "@/components/admin/PageHeader";
import { Search, ToggleLeft, Users } from "lucide-react";

// ---- Types ----
type AddonAgent = "metra" | "nomethes" | "hermes" | "logistes";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  planId: string | null;
  subStatus: string;
  addonAgents: string[];
  monthlyTotal: number;
}

interface AddonStat {
  count: number;
  mrr: number;
}

interface ApiData {
  users: UserRow[];
  addonStats: Record<AddonAgent, AddonStat>;
}

// ---- Constants ----
const ADDONS: { id: AddonAgent; name: string; color: string }[] = [
  { id: "metra", name: "Metra", color: "#4cd6a0" },
  { id: "nomethes", name: "Nomethes", color: "#ffb958" },
  { id: "hermes", name: "Hermes", color: "#ff6fa8" },
  { id: "logistes", name: "Logistes", color: "#8a92ff" },
];

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  fontSize: 10,
};

// ---- Toggle switch component ----
function ToggleSwitch({
  checked,
  onChange,
  color,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? color : "transparent",
        border: `1px solid ${checked ? color : "rgba(255,255,255,0.15)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 0.2s, border-color 0.2s",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: checked ? "#fff" : "rgba(255,255,255,0.4)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

// ---- Plan badge ----
function PlanBadge({ planId, status }: { planId: string | null; status: string }) {
  if (status === "none" || !planId) {
    return (
      <span
        style={{
          ...MONO,
          background: "rgba(255,255,255,0.05)",
          color: "rgba(255,255,255,0.35)",
          padding: "2px 8px",
          borderRadius: 4,
        }}
      >
        Sin sub
      </span>
    );
  }
  const isElite = planId === "elite";
  return (
    <span
      style={{
        ...MONO,
        background: isElite ? "rgba(124,92,255,0.15)" : "rgba(95,180,255,0.12)",
        color: isElite ? "#9a7fff" : "#5fb4ff",
        padding: "2px 8px",
        borderRadius: 4,
      }}
    >
      {isElite ? "Elite" : "Pro"}
    </span>
  );
}

// ---- Metric card ----
function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "20px 24px",
      }}
    >
      <p style={{ ...MONO, color: "rgba(255,255,255,0.45)", marginBottom: 10 }}>
        {label}
      </p>
      <p
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: color,
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </p>
      <p style={{ ...MONO, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
        {sub}
      </p>
    </div>
  );
}

// ---- Avatar ----
function UserAvatar({ name, email, image }: { name: string | null; email: string; image: string | null }) {
  const initials = (name || email).slice(0, 2).toUpperCase();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "rgba(124,92,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 600,
          color: "#9a7fff",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--foreground)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 180,
          }}
        >
          {name || "—"}
        </p>
        <p
          style={{
            ...MONO,
            fontSize: 10,
            color: "rgba(255,255,255,0.4)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 180,
          }}
        >
          {email}
        </p>
      </div>
    </div>
  );
}

// ---- Main content (client component, wrapped by AdminGate server component below) ----
function AddonsContent() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyWithSub, setOnlyWithSub] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  async function fetchData(search: string, withSub: boolean) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (withSub) params.set("onlyWithSub", "true");
      const res = await fetch(`/api/admin/addons?${params}`);
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData(q, onlyWithSub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(v: string) {
    setQ(v);
    startTransition(() => {
      fetchData(v, onlyWithSub);
    });
  }

  function handleOnlyWithSub(v: boolean) {
    setOnlyWithSub(v);
    fetchData(q, v);
  }

  async function handleToggle(userId: string, agent: AddonAgent, enabled: boolean) {
    const key = `${userId}-${agent}`;
    setToggling((t) => ({ ...t, [key]: true }));
    try {
      const res = await fetch("/api/admin/addons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, agent, enabled }),
      });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      // Optimistically update the local state
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          users: prev.users.map((u) =>
            u.id === userId
              ? { ...u, addonAgents: json.addonAgents, monthlyTotal: calcMrr(u.planId, json.addonAgents) }
              : u
          ),
        };
      });
    } catch {
      // Refetch on error
      fetchData(q, onlyWithSub);
    } finally {
      setToggling((t) => ({ ...t, [key]: false }));
    }
  }

  function calcMrr(planId: string | null, addons: string[]): number {
    let m = 0;
    if (planId === "elite") m += 200;
    else if (planId === "pro") m += 20;
    m += (addons?.length || 0) * 5;
    return m;
  }

  const users = data?.users ?? [];
  const stats = data?.addonStats;

  return (
    <div style={{ padding: "24px 24px 60px", maxWidth: 1200 }}>
      <PageHeader
        section="04 · Add-ons"
        title="Gestión de Add-ons"
        description="Activa o desactiva agentes premium por usuario. Cada add-on suma $5/mes al MRR."
      />

      {/* Metric cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 28,
        }}
      >
        {ADDONS.map((a) => (
          <MetricCard
            key={a.id}
            label={a.name}
            value={String(stats?.[a.id]?.count ?? "—")}
            sub={`MRR +$${stats?.[a.id]?.mrr ?? 0}`}
            color={a.color}
          />
        ))}
      </div>

      {/* Filter strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <Search
            size={14}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "rgba(255,255,255,0.35)",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            placeholder="Buscar por email o nombre..."
            value={q}
            onChange={(e) => handleSearch(e.target.value)}
            style={{
              width: "100%",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "8px 12px 8px 34px",
              fontSize: 13,
              color: "var(--foreground)",
              outline: "none",
            }}
          />
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <ToggleSwitch
            checked={onlyWithSub}
            onChange={handleOnlyWithSub}
            color="#7c5cff"
          />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
            Solo con suscripción activa
          </span>
        </label>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 100px repeat(4, 80px) 90px",
            gap: 0,
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          {["Usuario", "Plan", ...ADDONS.map((a) => a.name), "Total/mes"].map(
            (h, i) => (
              <p
                key={h}
                style={{
                  ...MONO,
                  color: "rgba(255,255,255,0.45)",
                  textAlign: i > 1 ? "center" : undefined,
                }}
              >
                {h}
              </p>
            )
          )}
        </div>

        {/* Rows */}
        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ ...MONO, color: "rgba(255,255,255,0.35)" }}>Cargando...</p>
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: "56px 20px", textAlign: "center" }}>
            <Users size={28} style={{ margin: "0 auto 12px", color: "rgba(255,255,255,0.2)" }} />
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.45)" }}>
              No hay usuarios.
            </p>
          </div>
        ) : (
          <div>
            {users.map((user, idx) => (
              <div
                key={user.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 100px repeat(4, 80px) 90px",
                  alignItems: "center",
                  padding: "12px 20px",
                  borderBottom:
                    idx < users.length - 1 ? "1px solid var(--border)" : undefined,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "rgba(255,255,255,0.02)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                {/* User */}
                <UserAvatar
                  name={user.name}
                  email={user.email}
                  image={user.image}
                />

                {/* Plan */}
                <div>
                  <PlanBadge planId={user.planId} status={user.subStatus} />
                </div>

                {/* Add-on toggles */}
                {ADDONS.map((a) => {
                  const key = `${user.id}-${a.id}`;
                  const isOn = user.addonAgents.includes(a.id);
                  return (
                    <div
                      key={a.id}
                      style={{ display: "flex", justifyContent: "center" }}
                    >
                      <ToggleSwitch
                        checked={isOn}
                        onChange={(v) => handleToggle(user.id, a.id, v)}
                        color={a.color}
                        disabled={!!toggling[key] || pending}
                      />
                    </div>
                  );
                })}

                {/* Total */}
                <p
                  style={{
                    ...MONO,
                    fontSize: 11,
                    color: user.monthlyTotal > 0 ? "#4cd6a0" : "rgba(255,255,255,0.3)",
                    textAlign: "center",
                  }}
                >
                  {user.monthlyTotal > 0 ? `$${user.monthlyTotal}` : "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Page (server component wrapping client content in AdminGate) ----
export default function AddonsPage() {
  return (
    <AdminGate>
      <AddonsContent />
    </AdminGate>
  );
}
