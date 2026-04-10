"use client";

import { useSession } from "next-auth/react";

export function Header({ title }: { title: string }) {
  const { data: session } = useSession();

  return (
    <header className="bg-white/80 backdrop-blur-sm border-b border-border/40 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
      <h1 className="text-xl font-bold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {session?.user?.image && (
          <img
            src={session.user.image}
            alt=""
            className="h-8 w-8 rounded-full ring-2 ring-border/50"
          />
        )}
        <span className="text-sm font-medium text-muted-foreground">
          {session?.user?.name}
        </span>
      </div>
    </header>
  );
}
