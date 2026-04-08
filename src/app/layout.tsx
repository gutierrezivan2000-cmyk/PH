import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PH Gestion - Plataforma para Administradores de Propiedad Horizontal",
  description:
    "Genera informes de gestion, actas y presentaciones profesionales para tu propiedad horizontal con inteligencia artificial.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
