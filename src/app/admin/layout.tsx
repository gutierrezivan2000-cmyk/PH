import { AdminProvider } from "@/components/admin/AdminProvider";

export const metadata = {
  title: "SOPH.IA · Admin",
  description: "Panel de administración SOPH.IA",
};

export default function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AdminProvider>{children}</AdminProvider>
    </div>
  );
}
