"use client";

import { useCallback, useEffect, useState } from "react";
import StudentModal, { type StudentLite } from "./StudentModal";
import CursoSelect from "@/components/CursoSelect";
import BulkAIImport from "./BulkAIImport";
import { formatRut } from "@/lib/rut";
import { fullName } from "@/lib/curso";

interface StudentRow extends StudentLite {
  enrolled: boolean;
}

const PAGE_SIZE = 60;

export default function StudentsTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [q, setQ] = useState("");
  const [cursoFilter, setCursoFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [modal, setModal] = useState<{
    open: boolean;
    initial?: Partial<StudentLite>;
  }>({ open: false });
  const [bulkAI, setBulkAI] = useState(false);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/students?q=${encodeURIComponent(query)}`);
      if (res.ok) setStudents(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const filtered = cursoFilter
    ? students.filter((s) => s.curso === cursoFilter)
    : students;

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  async function remove(id: string, nombre: string) {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return;
    await fetch(`/api/students/${id}`, { method: "DELETE" });
    load(q);
  }

  return (
    <div className="animate-pop">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className="input-game flex-1"
          placeholder="🔍 Buscar por nombre, apellido, RUT o curso..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setVisible(PAGE_SIZE);
          }}
        />
        <div className="w-full sm:w-56">
          <CursoSelect
            value={cursoFilter}
            onChange={(v) => {
              setCursoFilter(v);
              setVisible(PAGE_SIZE);
            }}
            className="input-game"
            emptyLabel="Todos los cursos"
          />
        </div>
        <button
          onClick={() => setModal({ open: true })}
          className="btn-game btn-blue whitespace-nowrap"
        >
          ➕ Agregar estudiante
        </button>
        <button
          onClick={() => setBulkAI(true)}
          className="btn-game btn-gray whitespace-nowrap"
          title="Sube una lista (PDF, imagen, Excel, Word) y la IA crea los estudiantes"
        >
          🤖 Carga masiva con IA
        </button>
      </div>

      {loading && (
        <div className="text-center text-[#6b7aa0] font-bold py-4">
          Cargando...
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="card p-8 text-center text-[#6b7aa0] font-semibold">
          No hay estudiantes todavía. ¡Agrega el primero! 🎉
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="text-sm font-bold text-[#6b7aa0] mb-3">
          Mostrando {shown.length} de {filtered.length}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shown.map((s) => (
          <div
            key={s._id}
            className="card p-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="font-black text-[#27407a] truncate">
                {fullName(s.nombre, s.apellidos)}
              </div>
              <div className="text-sm text-[#6b7aa0] font-semibold">
                {formatRut(s.rut)} · {s.curso}
                {s.anio ? ` · ${s.anio}` : ""}
              </div>
              <div className="flex gap-2 mt-1">
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
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => setModal({ open: true, initial: s })}
                className="btn-game btn-orange !py-1.5 !px-3 !text-sm"
              >
                ✏️ Editar
              </button>
              <button
                onClick={() => remove(s._id!, fullName(s.nombre, s.apellidos))}
                className="btn-game btn-red !py-1.5 !px-3 !text-sm"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center mt-5">
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="btn-game btn-gray !px-6"
          >
            Ver más ({filtered.length - visible} restantes)
          </button>
        </div>
      )}

      {modal.open && (
        <StudentModal
          initial={modal.initial}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            load(q);
          }}
        />
      )}

      {bulkAI && (
        <BulkAIImport
          mode="estudiantes"
          onClose={() => setBulkAI(false)}
          onDone={() => {
            setBulkAI(false);
            load(q);
          }}
        />
      )}
    </div>
  );
}
