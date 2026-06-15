"use client";

import { useEffect, useState } from "react";

export interface Branding {
  name: string;
  hasLogo: boolean;
  logoVersion: string;
}

const CACHE_KEY = "branding:v1";

// Borra la caché local del branding (úsalo tras guardar el logo/nombre).
export function clearBrandingCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function upsertIconLink(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
}

// Refresca inmediatamente el favicon/título en la pestaña actual tras guardar
// ajustes. Los navegadores cachean el favicon agresivamente, por eso agregamos
// un bust temporal además de la versión del logo.
export async function refreshBrandingAssets() {
  clearBrandingCache();
  try {
    const res = await fetch(`/api/branding?ts=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const d = await res.json();
    const next: Branding = {
      name: d.name || "",
      hasLogo: Boolean(d.hasLogo),
      logoVersion: String(d.logoVersion || "0"),
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    if (next.name) document.title = next.name;
    const href = next.hasLogo
      ? `/api/branding/logo?v=${encodeURIComponent(next.logoVersion)}&ts=${Date.now()}`
      : `/api/branding/logo?v=0&ts=${Date.now()}`;
    upsertIconLink("icon", href);
    upsertIconLink("shortcut icon", href);
    upsertIconLink("apple-touch-icon", href);
  } catch {
    /* ignore */
  }
}

// Lee el nombre del establecimiento, si hay logo y la versión del logo.
// Usa una caché en localStorage para pintar al instante (sin parpadeo) y luego
// se actualiza con datos frescos del endpoint liviano /api/branding.
export function useBranding(): Branding {
  const [b, setB] = useState<Branding>({
    name: "",
    hasLogo: false,
    logoVersion: "0",
  });

  useEffect(() => {
    let on = true;

    // 1) Caché local instantánea (evita ver el logo por defecto y luego el real).
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const p = JSON.parse(cached);
        if (p && typeof p === "object") setB(p);
      }
    } catch {
      /* sin caché */
    }

    // 2) Datos frescos.
    fetch("/api/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!on || !d) return;
        const next: Branding = {
          name: d.name || "",
          hasLogo: Boolean(d.hasLogo),
          logoVersion: String(d.logoVersion || "0"),
        };
        setB(next);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});

    return () => {
      on = false;
    };
  }, []);

  return b;
}

// Muestra el logo institucional (o un emoji de respaldo) con la estética del sitio.
// La URL del logo se versiona para poder cachearla de forma inmutable.
export function BrandLogo({
  hasLogo,
  fallback,
  size = 40,
  rounded = true,
  version = "0",
}: {
  hasLogo: boolean;
  fallback: string;
  size?: number;
  rounded?: boolean;
  version?: string;
}) {
  if (hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/branding/logo?v=${encodeURIComponent(version)}`}
        alt="Logo"
        width={size}
        height={size}
        className={`object-contain ${rounded ? "rounded-2xl" : ""}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span style={{ fontSize: size * 0.85, lineHeight: 1 }} aria-hidden>
      {fallback}
    </span>
  );
}
