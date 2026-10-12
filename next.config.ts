import type { NextConfig } from "next";

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
