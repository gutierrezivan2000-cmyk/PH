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
    <header className="bg-white dark:bg-[#12141f]/60 dark:backdrop-blur-2xl border-b border-gray-200 dark:border-white/10 px-4 sm:px-6 lg:px-8 xl:px-10 py-3 sm:py-4 lg:py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm shadow-gray-100 dark:shadow-black/10">
      <div className="flex flex-col gap-0.5 sm:gap-1 min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
            <span>SOPH.IA</span>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <ChevronRight className="h-3 w-3" />
                {crumb.href ? (
                  <a href={crumb.href} className="hover:text-violet-600 transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-gray-600 dark:text-gray-300 font-medium">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-base sm:text-lg lg:text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-gray-500 truncate">{subtitle}</p>
        )}
      </div>
      <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
        <div className="hidden md:flex flex-col items-end">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {session?.user?.name}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {session?.user?.email}
          </span>
        </div>
        {session?.user?.image ? (
          <img
            src={session.user.image}
            alt=""
            className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl ring-2 ring-white/50 dark:ring-white/20 shadow-lg shadow-violet-200/30 dark:shadow-black/20 object-cover"
          />
        ) : (
          <div className="h-9 w-9 lg:h-10 lg:w-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center ring-2 ring-white/50 shadow-lg shadow-violet-200/30">
            <User className="h-4 w-4 text-violet-600" />
          </div>
        )}
      </div>
    </header>
  );
}
