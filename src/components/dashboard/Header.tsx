"use client";

import { useSession } from "next-auth/react";
import { User, ChevronRight } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: { label: string; href?: string }[];
}

export function Header({ title, subtitle, breadcrumbs }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 px-4 sm:px-6 lg:px-8 py-3 sm:py-4 backdrop-blur-xl"
      style={{ WebkitBackdropFilter: "blur(20px)" }}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav
            className="hidden sm:flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground/70"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.16em" }}
          >
            <span>SOPH.IA</span>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3" />
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-foreground transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-foreground/80">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground truncate">
          {title}
        </h1>
        {subtitle && <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>}
      </div>
      <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-sm font-medium text-foreground">
            {session?.user?.name}
          </span>
          <span
            className="text-[10px] uppercase text-muted-foreground/70"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
          >
            {session?.user?.email}
          </span>
        </div>
        {session?.user?.image ? (
          <img
            src={session.user.image}
            alt=""
            className="h-9 w-9 rounded-xl border border-border object-cover"
          />
        ) : (
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center text-xs font-medium"
            style={{
              background: "rgba(124,92,255,0.10)",
              border: "1px solid rgba(124,92,255,0.30)",
              color: "#9a7fff",
              fontFamily: "var(--font-mono)",
            }}
          >
            <User className="h-4 w-4" />
          </div>
        )}
      </div>
    </header>
  );
}
