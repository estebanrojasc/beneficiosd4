"use client";

import { useEffect, useState } from "react";

export interface Branding {
  name: string;
  hasLogo: boolean;
}

// Lee el nombre del establecimiento y si hay logo cargado (settings es público).
export function useBranding(): Branding {
  const [b, setB] = useState<Branding>({ name: "", hasLogo: false });
  useEffect(() => {
    let on = true;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (on && d)
          setB({
            name: d.establecimientoNombre || "",
            hasLogo: Boolean(d.logo),
          });
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  return b;
}

// Muestra el logo institucional (o un emoji de respaldo) con la estética del sitio.
export function BrandLogo({
  hasLogo,
  fallback,
  size = 40,
  rounded = true,
}: {
  hasLogo: boolean;
  fallback: string;
  size?: number;
  rounded?: boolean;
}) {
  if (hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/api/branding/logo"
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
