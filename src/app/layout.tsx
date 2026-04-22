import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "SOPH.IA — Inteligencia Artificial para Propiedad Horizontal",
  description:
    "SOPH.IA genera informes de gestión, actas legales y presentaciones profesionales con inteligencia artificial para administradores de propiedad horizontal. Ahorra tiempo y eleva la calidad de tus documentos.",
  keywords: [
    "propiedad horizontal",
    "administración PH",
    "inteligencia artificial",
    "informes de gestión",
    "actas de asamblea",
    "presentaciones PH",
    "software administración",
    "SOPH.IA",
    "generador de actas",
    "copropiedades",
  ],
  openGraph: {
    title: "SOPH.IA — Inteligencia Artificial para Propiedad Horizontal",
    description:
      "Genera informes de gestión, actas legales y presentaciones profesionales con IA. La plataforma inteligente para administradores de propiedad horizontal.",
    type: "website",
    locale: "es_CO",
    siteName: "SOPH.IA",
  },
  twitter: {
    card: "summary_large_image",
    title: "SOPH.IA — IA para Propiedad Horizontal",
    description:
      "Genera informes, actas y presentaciones con inteligencia artificial. La herramienta definitiva para administradores de propiedad horizontal.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SOPH.IA",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Plataforma de inteligencia artificial que genera informes de gestión, actas legales y presentaciones profesionales para administradores de propiedad horizontal.",
  offers: {
    "@type": "Offer",
    category: "SaaS",
  },
  featureList: [
    "Generación de informes de gestión con IA",
    "Creación de actas legales automatizadas",
    "Presentaciones profesionales para asambleas",
    "Gestión documental inteligente",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sophia-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme:dark)").matches);var el=document.documentElement;if(d){el.classList.add("dark");el.style.colorScheme="dark"}else{el.classList.remove("dark");el.style.colorScheme="light"}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
