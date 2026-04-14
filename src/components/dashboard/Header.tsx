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
    <header className="hidden lg:flex bg-white/80 backdrop-blur-xl border-b border-gray-200/40 px-8 xl:px-10 py-5 items-center justify-between sticky top-0 z-20 shadow-sm shadow-gray-100/50">
      <div className="flex flex-col gap-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>SOPH.IA</span>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3" />
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-violet-600 transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-gray-600 font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-gray-500">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-sm font-semibold text-gray-700">
            {session?.user?.name}
          </span>
          <span className="text-xs text-gray-400">
            {session?.user?.email}
          </span>
        </div>
        {session?.user?.image ? (
          <img
            src={session.user.image}
            alt=""
            className="h-10 w-10 rounded-xl ring-2 ring-violet-100/80 shadow-sm object-cover"
          />
        ) : (
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center ring-2 ring-violet-100/80 shadow-sm">
            <User className="h-4 w-4 text-violet-600" />
          </div>
        )}
      </div>
    </header>
  );
}
