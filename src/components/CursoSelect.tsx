"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cicloOrder } from "@/lib/curso";
import type { Curso } from "@/lib/curso";

interface Props {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  emptyLabel?: string;
}

// Combobox con búsqueda, pensado para muchos cursos (~30+).
// Agrupa por ciclo y permite filtrar escribiendo.
export default function CursoSelect({
  value,
  onChange,
  className = "input-game",
  emptyLabel = "Selecciona un curso",
}: Props) {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/cursos")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCursos(Array.isArray(data) ? data : []))
      .catch(() => setCursos([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? cursos.filter((c) => c.nombre.toLowerCase().includes(q))
      : cursos;
    return list.reduce<Record<string, Curso[]>>((acc, c) => {
      (acc[c.ciclo] ||= []).push(c);
      return acc;
    }, {});
  }, [cursos, query]);

  function select(nombre: string) {
    onChange(nombre);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${className} flex items-center justify-between text-left`}
      >
        <span className={value ? "text-[#1b2a4a]" : "text-[#9aa6bf]"}>
          {loading ? "Cargando cursos..." : value || emptyLabel}
        </span>
        <span className="text-[#9aa6bf] ml-2">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl bg-white border-2 border-[#eef2ff] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[#eef2ff]">
            <input
              autoFocus
              className="input-game !py-2"
              placeholder="🔍 Buscar curso..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {value && (
              <button
                type="button"
                onClick={() => select("")}
                className="w-full text-left px-3 py-2 rounded-xl font-semibold text-[#9aa6bf] hover:bg-[#f4f8ff]"
              >
                ✕ Quitar selección
              </button>
            )}
            {Object.keys(filtered).length === 0 && (
              <div className="text-center text-[#9aa6bf] font-semibold py-4">
                Sin resultados
              </div>
            )}
            {Object.entries(filtered)
              .sort(([a], [b]) => cicloOrder(a) - cicloOrder(b))
              .map(([ciclo, items]) => (
              <div key={ciclo} className="mb-1">
                <div className="px-2 pt-2 pb-1 text-xs font-black uppercase text-[#9aa6bf]">
                  {ciclo}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {items.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => select(c.nombre)}
                      className={`px-2 py-2 rounded-xl font-bold text-sm leading-tight transition ${
                        value === c.nombre
                          ? "bg-[#4f7cff] text-white"
                          : "bg-[#f4f8ff] text-[#41507a] hover:bg-[#e7eeff]"
                      }`}
                    >
                      {c.nivel ? `${c.nivel}°${c.letra}` : c.letra}
                      <span className="block text-[10px] font-semibold opacity-70">
                        {c.anio}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
