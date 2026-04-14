import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOPH.IA - Informes y Actas de Propiedad Horizontal con IA",
  description:
    "Genera informes de gestion, actas legales y presentaciones profesionales para propiedad horizontal en minutos con inteligencia artificial. Cumple Ley 675.",
  keywords: [
    "propiedad horizontal",
    "informes de gestion",
    "actas legales",
    "ley 675",
    "administracion PH",
    "inteligencia artificial",
    "software propiedad horizontal",
  ],
  openGraph: {
    title: "SOPH.IA - Informes y Actas de Propiedad Horizontal con IA",
    description:
      "Genera informes, actas y presentaciones profesionales para tu propiedad horizontal en minutos. Potenciado con IA.",
    type: "website",
    locale: "es_CO",
  },
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
