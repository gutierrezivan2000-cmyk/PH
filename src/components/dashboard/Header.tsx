"use client";

import { useSession } from "next-auth/react";

export function Header({ title }: { title: string }) {
  const { data: session } = useSession();

  return (
    <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <div className="flex items-center gap-3">
        {session?.user?.image && (
          <img
            src={session.user.image}
            alt=""
            className="h-8 w-8 rounded-full"
          />
        )}
        <span className="text-sm text-muted-foreground">
          {session?.user?.name}
        </span>
      </div>
    </header>
  );
}
