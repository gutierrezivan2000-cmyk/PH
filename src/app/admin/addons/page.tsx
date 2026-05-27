import { AdminGate } from "@/components/admin/AdminGate";
import { AddonsContent } from "./AddonsClient";

export default function AddonsPage() {
  return (
    <AdminGate>
      <AddonsContent />
    </AdminGate>
  );
}
