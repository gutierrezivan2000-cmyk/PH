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
    <html lang="es" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
