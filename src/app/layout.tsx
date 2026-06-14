import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Registro Escolar",
  description: "Listas y validación con reconocimiento facial",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/api/branding/logo",
    shortcut: "/api/branding/logo",
    apple: "/api/branding/logo",
  },
};

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
