import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "mammoth",
    "xlsx",
    "pptxgenjs",
    "@napi-rs/canvas",
    "@prisma/adapter-pg",
    "pg",
    "epayco-sdk-node",
  ],
};

export default nextConfig;
