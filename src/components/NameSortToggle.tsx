"use client";

import type { NameSort } from "@/lib/curso";

// Botón segmentado pequeño para ordenar listados por apellido o por nombre.
export default function NameSortToggle({
  value,
  onChange,
  className = "",
}: {
  value: NameSort;
  onChange: (v: NameSort) => void;
  className?: string;
}) {
  const opciones: { k: NameSort; label: string }[] = [
    { k: "apellidos", label: "Apellido" },
    { k: "nombre", label: "Nombre" },
  ];
  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      title="Ordenar la lista"
    >
      <span className="text-xs font-bold text-[#9aa6bf]">Ordenar:</span>
      <div className="inline-flex rounded-xl border-2 border-[#eef2ff] overflow-hidden">
        {opciones.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={`px-2.5 py-1 text-xs font-extrabold transition ${
              value === k
                ? "bg-[#4f7cff] text-white"
                : "bg-white text-[#41507a] hover:bg-[#f6f8ff]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
