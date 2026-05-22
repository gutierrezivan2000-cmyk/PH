import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Wraps an admin page: validates the session, redirects to /admin/login if not
 * an admin, and renders the AdminShell chrome around children.
 *
 * Use in every admin page except /admin/login.
 */
export async function AdminGate({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin/login");
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
