import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar en celulares con Cloudflare Quick Tunnel.
  // Sin esto, Next dev bloquea el WebSocket de HMR desde *.trycloudflare.com.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Librerías de Node que no deben empaquetarse (se cargan en runtime).
  serverExternalPackages: ["mammoth", "exceljs", "pdf-lib"],
};

export default nextConfig;
