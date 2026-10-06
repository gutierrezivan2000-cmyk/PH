"use client";

import { useSession } from "next-auth/react";
import { puedeVerReuniones } from "@/lib/feature-flags";

/** ¿Ve esta persona «Reuniones»? Mientras sea solo para administradores, los accesos a Reuniones no se muestran a nadie más. */
export function useVerReuniones(): boolean {
  const { data: session } = useSession();
  return puedeVerReuniones({ role: session?.user?.role, demo: process.env.NEXT_PUBLIC_DEMO_MODE === "true" });
}
