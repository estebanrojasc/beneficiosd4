import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite probar en celulares con Cloudflare Quick Tunnel.
  // Sin esto, Next dev bloquea el WebSocket de HMR desde *.trycloudflare.com.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // Librerías de Node que no deben empaquetarse (se cargan en runtime).
  serverExternalPackages: ["mammoth", "exceljs", "pdf-lib"],
  // El navegador siempre pide /favicon.ico por su cuenta (ignorando el <link>
  // del logo). Sin un archivo en /app o /public, mostraría un ícono por defecto
  // cacheado (el de Next/Vercel). Lo redirigimos al logo del establecimiento.
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/api/branding/logo",
      },
    ];
  },
};

export default nextConfig;
