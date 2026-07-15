"use client";

import { SessionProvider } from "next-auth/react";

export function EmpresaProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
