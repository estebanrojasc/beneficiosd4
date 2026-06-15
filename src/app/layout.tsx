import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// El favicon/título se generan en cada request leyendo la configuración, y la
// URL del logo se versiona para que el navegador NO se quede con un favicon
// cacheado al cambiar el logo.
export async function generateMetadata(): Promise<Metadata> {
  let nombre = "Registro Escolar";
  let version = "0";
  try {
    const db = await getDb();
    const { establecimientoNombre, logo } = await getSettings(db);
    if (establecimientoNombre) nombre = establecimientoNombre;
    // Versión derivada del contenido del logo (cambia si cambia el logo).
    version = logo ? String(logo.length) : "0";
  } catch {
    // Si falla la base, usamos valores por defecto.
  }
  const logoUrl = `/api/branding/logo?v=${version}`;
  return {
    title: nombre,
    description: "Listas y validación con reconocimiento facial",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: logoUrl,
      shortcut: logoUrl,
      apple: logoUrl,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#4f7cff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-playful">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
