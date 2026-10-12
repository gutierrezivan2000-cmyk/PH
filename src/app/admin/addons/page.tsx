import { AdminGate } from "@/components/admin/AdminGate";
import { requireAdmin } from "@/lib/admin-auth";
import { esAdminDeEntorno } from "@/lib/admin-emails";
import { AddonsContent } from "./AddonsClient";

export default async function AddonsPage() {
  // Se pasa quién mira para que su propia fila no ofrezca interruptores que terminarían en 403 (salvo a los propietarios).
  const admin = await requireAdmin();
  return (
    <AdminGate>
      <AddonsContent adminId={admin?.userId ?? null} esPropietario={esAdminDeEntorno(admin?.email)} />
    </AdminGate>
  );
}
