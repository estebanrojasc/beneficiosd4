"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CICLO_OPTIONS,
  buildCursoName,
  getCicloConfig,
  cicloOrder,
  fullName,
} from "@/lib/curso";
import type { Curso } from "@/lib/curso";
import { formatRut } from "@/lib/rut";
import { fetchStudentsPage } from "@/lib/studentsClient";

interface CursoStudent {
  _id: string;
  nombre: string;
  apellidos?: string;
  rut: string;
  perteneceAlmuerzo: boolean;
  enrolled: boolean;
}

export default function CursosTab() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(false);
  const [nivel, setNivel] = useState(1);
  const [ciclo, setCiclo] = useState<string>("Básico");
  const [letra, setLetra] = useState("A");
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Detalle de curso: estudiantes del curso seleccionado.
  const [detalle, setDetalle] = useState<Curso | null>(null);
  const [detalleStudents, setDetalleStudents] = useState<CursoStudent[]>([]);
  const [detalleLoading, setDetalleLoading] = useState(false);

  async function openDetalle(curso: Curso) {
    setDetalle(curso);
    setDetalleStudents([]);
    setDetalleLoading(true);
    try {
      const params = new URLSearchParams({
        curso: curso.nombre,
        anio: String(curso.anio),
        limit: "200",
      });
      const page = await fetchStudentsPage<CursoStudent>(params);
      setDetalleStudents(page.items);
    } finally {
      setDetalleLoading(false);
    }
  }

  const cicloConf = getCicloConfig(ciclo);
  const usaNivel = cicloConf?.usaNivel ?? true;
  const nivelMin = cicloConf?.min ?? 1;
  const nivelMax = cicloConf?.max ?? 8;

  // Al cambiar de ciclo, ajusta el nivel al rango válido.
  function changeCiclo(next: string) {
    setCiclo(next);
    const conf = getCicloConfig(next);
    if (conf?.usaNivel) {
      const min = conf.min ?? 1;
      const max = conf.max ?? 8;
      setNivel((n) => Math.min(Math.max(n, min), max));
    }
  }

  const preview = buildCursoName(nivel, ciclo, letra);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cursos");
      if (res.ok) setCursos(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function addCurso(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    const res = await fetch("/api/cursos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nivel, ciclo, letra, anio }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "No se pudo crear el curso");
      return;
    }
    setMsg(`✅ Curso creado: ${data.nombre} (${anio})`);
    load();
  }

  async function remove(id: string, nombre: string) {
    if (!confirm(`¿Desactivar el curso "${nombre}"?`)) return;
    await fetch(`/api/cursos/${id}`, { method: "DELETE" });
    load();
  }

  // Agrupa por año (más reciente primero) y, dentro de cada año, por ciclo.
  const byYear = cursos.reduce<Record<number, Curso[]>>((acc, c) => {
    (acc[c.anio] ||= []).push(c);
    return acc;
  }, {});
  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="animate-pop">
      <div className="card p-4 mb-4">
        <h3 className="font-black text-[#27407a] mb-1">Crear curso</h3>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-3">
          El curso pertenece al año que indiques. Los estudiantes que asignes a
          este curso quedan en ese año.
        </p>
        <form
          onSubmit={addCurso}
          className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end"
        >
          <div>
            <label className="label-game">Año</label>
            <input
              type="number"
              className="input-game"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              min={2020}
              max={2100}
            />
          </div>
          <div>
            <label className="label-game">Ciclo</label>
            <select
              className="input-game"
              value={ciclo}
              onChange={(e) => changeCiclo(e.target.value)}
            >
              {CICLO_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-game">Nivel</label>
            <select
              className="input-game disabled:opacity-50"
              value={usaNivel ? nivel : ""}
              disabled={!usaNivel}
              onChange={(e) => setNivel(Number(e.target.value))}
            >
              {/* Prekínder/Kínder no usan número: el selector queda deshabilitado. */}
              {!usaNivel && <option value="">Sin nivel</option>}
              {usaNivel &&
                Array.from(
                  { length: nivelMax - nivelMin + 1 },
                  (_, i) => nivelMin + i
                ).map((n) => (
                  <option key={n} value={n}>
                    {n}°
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label-game">Letra</label>
            <input
              className="input-game uppercase text-center text-xl"
              value={letra}
              maxLength={1}
              onChange={(e) =>
                setLetra(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())
              }
              placeholder="A"
            />
          </div>
          <button type="submit" className="btn-game btn-blue">
            ➕ Crear
          </button>
        </form>

        <div className="mt-3 text-center font-bold text-[#4f7cff]">
          Vista previa: {preview} · {anio}
        </div>

        {error && (
          <div className="mt-3 text-center font-bold text-[#ef4444]">{error}</div>
        )}
        {msg && (
          <div className="mt-3 text-center font-bold text-[#22a558]">{msg}</div>
        )}
      </div>

      {loading && (
        <div className="text-center text-[#6b7aa0] font-bold py-4">
          Cargando cursos...
        </div>
      )}

      {!loading && cursos.length === 0 && (
        <div className="card p-8 text-center text-[#6b7aa0] font-semibold">
          No hay cursos creados. Crea el primero arriba.
        </div>
      )}

      {years.map((year) => {
        const grouped = byYear[year].reduce<Record<string, Curso[]>>(
          (acc, c) => {
            (acc[c.ciclo] ||= []).push(c);
            return acc;
          },
          {}
        );
        return (
          <div key={year} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-xl font-black text-[#27407a]">Año {year}</h3>
              <span className="text-sm font-bold text-[#9aa6bf]">
                ({byYear[year].length} cursos)
              </span>
            </div>
            {Object.entries(grouped)
              .sort(([a], [b]) => cicloOrder(a) - cicloOrder(b))
              .map(([cicloName, items]) => (
              <div key={cicloName} className="mb-3">
                <h4 className="font-black text-[#41507a] mb-2">{cicloName}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {items.map((c) => (
                    <div
                      key={c._id}
                      className="card p-3 flex items-center justify-between gap-2"
                    >
                      <button
                        onClick={() => openDetalle(c)}
                        className="font-black text-[#27407a] text-left hover:text-[#4f7cff] truncate flex-1"
                        title="Ver estudiantes del curso"
                      >
                        {c.nombre} <span className="text-[#9aa6bf]">›</span>
                      </button>
                      <button
                        onClick={() => remove(c._id!, c.nombre)}
                        className="btn-game btn-red !py-1 !px-2 !text-sm shrink-0"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {detalle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto"
          onClick={() => setDetalle(null)}
        >
          <div
            className="card p-6 w-full max-w-lg my-auto animate-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-black text-[#27407a]">
                {detalle.nombre}
              </h2>
              <button
                onClick={() => setDetalle(null)}
                className="text-2xl font-black text-[#9aa6bf]"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
              Año {detalle.anio} ·{" "}
              {detalleLoading
                ? "cargando..."
                : `${detalleStudents.length} estudiante${
                    detalleStudents.length === 1 ? "" : "s"
                  }`}
            </p>

            {detalleLoading && (
              <div className="text-center text-[#6b7aa0] font-bold py-6">
                Cargando estudiantes...
              </div>
            )}

            {!detalleLoading && detalleStudents.length === 0 && (
              <div className="text-center text-[#6b7aa0] font-semibold py-6">
                Este curso aún no tiene estudiantes.
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 max-h-[55vh] overflow-y-auto">
              {detalleStudents.map((s) => (
                <div
                  key={s._id}
                  className="rounded-2xl bg-[#f6f8ff] p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-black text-[#27407a] truncate">
                      {fullName(s.nombre, s.apellidos)}
                    </div>
                    <div className="text-sm text-[#6b7aa0] font-semibold">
                      {formatRut(s.rut)}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <span
                      className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                        s.enrolled
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {s.enrolled ? "Cara ✓" : "Sin cara"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
