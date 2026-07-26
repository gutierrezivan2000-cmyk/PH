"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

/* Shared surfaces for the dashboard. These replace the copy-pasted inline
   `card` objects each page was defining, so spacing, depth, hover and focus
   are consistent everywhere — the main reason the UI read as "rudimentary". */

export function Surface({
  className,
  interactive,
  accent,
  sheen = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
  accent?: boolean;
  sheen?: boolean;
}) {
  return (
    <div
      className={cn(
        "ui-card",
        sheen && "ui-sheen",
        interactive && "ui-card-interactive cursor-pointer",
        accent && "ui-card-accent",
        className
      )}
      {...props}
    />
  );
}

/** Small uppercase mono label — the app's signature typographic detail. */
export function MonoLabel({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("block", className)}
      style={{
        fontFamily: "var(--hifi-mono)",
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "var(--hifi-ink-faint)",
        ...style,
      }}
      {...props}
    />
  );
}

/** Section header with an optional action on the right. */
export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <MonoLabel>{title}</MonoLabel>
        {hint && (
          <p className="text-[12px] mt-1" style={{ color: "var(--hifi-ink-faint)" }}>
            {hint}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Skeletons ────────────────────────────────────────────────────── */

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("ui-skeleton", className)} style={style} />;
}

/** Drop-in loading state that mirrors the shape of the content to come —
 *  reads far more "solid" than a lone spinner. */
export function SkeletonList({ rows = 4, kpis = 0 }: { rows?: number; kpis?: number }) {
  return (
    <div className="space-y-4">
      {kpis > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="ui-card p-4">
              <Skeleton className="h-2.5 w-20 mb-3" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </div>
      )}
      <div className="ui-card overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-4"
            style={{ borderBottom: i < rows - 1 ? "1px solid var(--hifi-hairline)" : "none" }}
          >
            <Skeleton className="h-9 w-9 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-1/5" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: "neutral" | "accent" | "ok";
}) {
  const ring =
    tone === "accent"
      ? "var(--hifi-accent-line)"
      : tone === "ok"
        ? "rgba(76,214,160,0.30)"
        : "var(--hifi-hairline-strong)";
  const glow =
    tone === "accent"
      ? "var(--hifi-accent-soft)"
      : tone === "ok"
        ? "rgba(76,214,160,0.08)"
        : "rgba(255,255,255,0.04)";
  const color =
    tone === "accent" ? "var(--hifi-accent-hi)" : tone === "ok" ? "var(--hifi-ok)" : "var(--hifi-ink-faint)";

  return (
    <Surface className="px-8 py-12 text-center ui-rise">
      <div
        className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
        style={{ width: 56, height: 56, background: glow, border: `1px solid ${ring}` }}
      >
        <Icon className="h-6 w-6" style={{ color }} />
      </div>
      <p className="text-[15px] font-medium mb-1.5" style={{ color: "var(--hifi-ink)" }}>
        {title}
      </p>
      {description && (
        <p
          className="text-[13px] leading-relaxed mx-auto mb-5"
          style={{ color: "var(--hifi-ink-faint)", maxWidth: 380 }}
        >
          {description}
        </p>
      )}
      {action}
    </Surface>
  );
}

/* ── KPI card ─────────────────────────────────────────────────────── */

export function StatCard({
  label,
  value,
  tone = "neutral",
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "ok" | "warn" | "danger" | "accent";
  hint?: string;
  icon?: React.ElementType;
}) {
  const color = {
    neutral: "var(--hifi-ink)",
    ok: "var(--hifi-ok)",
    warn: "var(--hifi-warn)",
    danger: "var(--hifi-danger)",
    accent: "var(--hifi-accent-hi)",
  }[tone];

  return (
    <Surface className="p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <MonoLabel>{label}</MonoLabel>
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--hifi-ink-faint)" }} />}
      </div>
      <p className="ui-count text-[19px] font-semibold tracking-tight" style={{ color }}>
        {value}
      </p>
      {hint && (
        <p className="text-[11px] mt-0.5" style={{ color: "var(--hifi-ink-faint)" }}>
          {hint}
        </p>
      )}
    </Surface>
  );
}

/* ── Inline alert / feedback ──────────────────────────────────────── */

export function Callout({
  tone = "info",
  icon: Icon,
  children,
  action,
}: {
  tone?: "info" | "ok" | "warn" | "danger";
  icon?: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const c = {
    info: { fg: "var(--hifi-accent-hi)", bg: "var(--hifi-accent-soft)", bd: "var(--hifi-accent-line)" },
    ok: { fg: "var(--hifi-ok)", bg: "rgba(76,214,160,0.09)", bd: "rgba(76,214,160,0.28)" },
    warn: { fg: "var(--hifi-warn)", bg: "rgba(255,185,88,0.09)", bd: "rgba(255,185,88,0.28)" },
    danger: { fg: "var(--hifi-danger)", bg: "rgba(255,111,111,0.09)", bd: "rgba(255,111,111,0.28)" },
  }[tone];

  return (
    <div
      className="ui-rise flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[12.5px] leading-relaxed"
      style={{ background: c.bg, border: `1px solid ${c.bd}`, color: c.fg }}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0 mt-px" />}
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}

/* ── Toast ────────────────────────────────────────────────────────── */

export interface ToastMsg {
  ok: boolean;
  text: string;
}

/** Floating, auto-dismissing feedback. Pages that used inline text for
 *  "guardado / error" get a far more responsive feel with this. */
export function Toast({
  msg,
  onDone,
  duration = 4000,
}: {
  msg: ToastMsg | null;
  onDone: () => void;
  duration?: number;
}) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!msg) return;
    setLeaving(false);
    const t1 = setTimeout(() => setLeaving(true), duration - 200);
    const t2 = setTimeout(onDone, duration);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [msg, duration, onDone]);

  if (!msg) return null;

  return (
    <div
      className="fixed z-50 left-1/2 -translate-x-1/2 bottom-6 px-4"
      style={{ maxWidth: "min(460px, calc(100vw - 32px))" }}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn("flex items-start gap-2.5 rounded-xl px-4 py-3 text-[13px]", leaving ? "ui-toast-out" : "ui-toast")}
        style={{
          background: msg.ok ? "rgba(20,42,33,0.96)" : "rgba(48,22,22,0.96)",
          border: `1px solid ${msg.ok ? "rgba(76,214,160,0.35)" : "rgba(255,111,111,0.35)"}`,
          color: msg.ok ? "var(--hifi-ok)" : "var(--hifi-danger)",
          boxShadow: "var(--shadow-lift)",
          backdropFilter: "blur(12px)",
        }}
      >
        <span
          className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
          style={{ background: msg.ok ? "var(--hifi-ok)" : "var(--hifi-danger)" }}
        />
        <span className="flex-1">{msg.text}</span>
      </div>
    </div>
  );
}
