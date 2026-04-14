"use client";

import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { useSidebarToggle } from "@/components/dashboard/sidebar-context";

export function Header({ title }: { title: string }) {
  const { data: session } = useSession();
  const { toggle } = useSidebarToggle();

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-border/40 px-4 lg:px-8 py-4 lg:py-5 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="lg:hidden p-2 -ml-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {session?.user?.image && (
          <img
            src={session.user.image}
            alt=""
            className="h-8 w-8 rounded-full ring-2 ring-border/50"
          />
        )}
        <span className="text-sm font-medium text-muted-foreground hidden sm:block">
          {session?.user?.name}
        </span>
      </div>
    </header>
  );
}
