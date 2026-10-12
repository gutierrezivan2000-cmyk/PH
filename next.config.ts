import type { NextConfig } from "next";
import { construirCabecerasCsp } from "./src/lib/csp";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Fuerza HTTPS en el navegador una vez visitado el sitio (Vercel ya redirige HTTP → HTTPS).
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Nadie puede embeber la aplicación en un marco (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // El micrófono solo para la propia app (grabadora de reuniones); lo demás, apagado.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
        ],
      },
      {
        // Content-Security-Policy (src/lib/csp.ts): una política forzada que no puede romper el pintado y la estricta en modo
        // solo-informe. Solo en las PÁGINAS: la API devuelve JSON, descargas y PDF, y una CSP con `object-src 'none'` en la
        // respuesta de un PDF puede estorbar al visor del navegador. Ahí siguen las cinco cabeceras de arriba (X-Frame-Options
        // incluida). Tampoco en /_next/ (archivos estáticos): la CSP solo importa en documentos.
        source: "/((?!api/|_next/).*)",
        headers: construirCabecerasCsp({ desarrollo: process.env.NODE_ENV === "development" }),
      },
    ];
  },
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "xlsx",
    "@napi-rs/canvas",
    "@prisma/adapter-pg",
    "pg",
    "epayco-sdk-node",
    "@ffmpeg-installer/ffmpeg",
    "fluent-ffmpeg",
  ],
};

export default nextConfig;
