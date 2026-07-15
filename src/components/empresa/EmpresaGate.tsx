import { redirect } from "next/navigation";
import { requireElite, type EliteSession } from "@/lib/elite-auth";

/**
 * Server helper for /empresa pages: returns the Elite session (with userId to
 * scope queries) or redirects non-Elite/beta users back to /dashboard.
 * Pages render the returned session inside <EmpresaShell elite={...}>.
 */
export async function eliteGate(): Promise<EliteSession> {
  const elite = await requireElite();
  if (!elite) redirect("/dashboard");
  return elite;
}
