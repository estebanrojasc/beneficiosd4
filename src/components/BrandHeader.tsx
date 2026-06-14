"use client";

import { useBranding, BrandLogo } from "./Brand";

// Encabezado institucional centrado: logo (o emoji), nombre del establecimiento
// y subtítulo. Mantiene la estética alegre del sitio.
export default function BrandHeader({
  fallbackEmoji,
  subtitle,
}: {
  fallbackEmoji: string;
  subtitle: string;
}) {
  const { name, hasLogo } = useBranding();
  return (
    <div className="text-center mb-8 animate-pop">
      <div className="mb-3 flex justify-center">
        <BrandLogo
          hasLogo={hasLogo}
          fallback={fallbackEmoji}
          size={hasLogo ? 104 : 96}
        />
      </div>
      <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-[#27407a]">
        {name || "Registro Escolar"}
      </h1>
      {name && (
        <p className="mt-1 text-sm font-bold uppercase tracking-wide text-[#9aa6bf]">
          Registro Escolar
        </p>
      )}
      <p className="mt-3 text-lg text-[#5b6b94] font-semibold">{subtitle}</p>
    </div>
  );
}
