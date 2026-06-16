"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { StudentLite } from "./StudentModal";
import CursoSelect from "@/components/CursoSelect";
import NameSortToggle from "@/components/NameSortToggle";
import { formatRut } from "@/lib/rut";
import { fullName, type NameSort } from "@/lib/curso";
import { fetchStudentsPage } from "@/lib/studentsClient";

interface StudentRow extends StudentLite {
  enrolled: boolean;
}

const PAGE_SIZE = 60;
const MIN_SEARCH = 2;

const ModalLoading = () => (
  <div className="text-center font-bold text-[#6b7aa0] py-8">Cargando...</div>
);
const StudentModal = dynamic(() => import("./StudentModal"), {
  loading: () => <ModalLoading />,
  ssr: false,
});
const BulkAIImport = dynamic(() => import("./BulkAIImport"), {
  loading: () => <ModalLoading />,
  ssr: false,
});

export default function StudentsTab() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [q, setQ] = useState("");
  const [cursoFilter, setCursoFilter] = useState("");
  const [sortBy, setSortBy] = useState<NameSort>("apellidos");
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [modal, setModal] = useState<{
    open: boolean;
    initial?: Partial<StudentLite>;
  }>({ open: false });
  const [bulkAI, setBulkAI] = useState(false);

  const canLoad =
    q.trim().length >= MIN_SEARCH || Boolean(cursoFilter.trim());

  const load = useCallback(
    async (
      query: string,
      curso: string,
      sort: NameSort,
      skip = 0,
      append = false
    ) => {
      const searchable = query.trim().length >= MIN_SEARCH || Boolean(curso);
      if (!searchable) {
        setStudents([]);
        setTotal(0);
        setHasMore(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          skip: String(skip),
          sort,
        });
        if (query.trim()) params.set("q", query.trim());
        if (curso) params.set("curso", curso);
        const page = await fetchStudentsPage<StudentRow>(params);
        setStudents((prev) => (append ? [...prev, ...page.items] : page.items));
        setTotal(page.total);
        setHasMore(page.hasMore);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const t = setTimeout(() => load(q, cursoFilter, sortBy, 0, false), 250);
    return () => clearTimeout(t);
  }, [q, cursoFilter, sortBy, load]);

  async function remove(id: string, nombre: string) {
    if (!confirm(`¿Eliminar a ${nombre}?`)) return;
    await fetch(`/api/students/${id}`, { method: "DELETE" });
    load(q, cursoFilter, sortBy, 0, false);
  }

  return (
    <div className="animate-pop">
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          className="input-game flex-1"
          placeholder="🔍 Buscar por nombre, apellido, RUT o curso..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="w-full sm:w-56">
          <CursoSelect
            value={cursoFilter}
            onChange={setCursoFilter}
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

      {!canLoad && !loading && (
        <div className="card p-8 text-center text-[#6b7aa0] font-semibold">
          Escribe al menos {MIN_SEARCH} caracteres para buscar, o elige un curso
          para ver estudiantes sin cargar toda la base de una vez.
        </div>
      )}

      {loading && (
        <div className="text-center text-[#6b7aa0] font-bold py-4">
          Cargando...
        </div>
      )}

      {canLoad && !loading && students.length === 0 && (
        <div className="card p-8 text-center text-[#6b7aa0] font-semibold">
          No hay estudiantes con ese criterio.
        </div>
      )}

      {canLoad && !loading && students.length > 0 && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="text-sm font-bold text-[#6b7aa0]">
            Mostrando {students.length} de {total}
          </div>
          <NameSortToggle value={sortBy} onChange={setSortBy} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {students.map((s) => (
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
              <div className="flex gap-2 mt-1 flex-wrap">
                <span
                  className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                    s.enrolled
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {s.enrolled ? "Cara ✓" : "Sin cara"}
                </span>
                <span
                  className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                    s.consent?.status === "otorgado"
                      ? "bg-green-100 text-green-700"
                      : s.consent?.status === "revocado"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                  title="Autorización del apoderado"
                >
                  {s.consent?.status === "otorgado"
                    ? "Autorizado ✓"
                    : s.consent?.status === "revocado"
                    ? "Revocado"
                    : "Sin autorización"}
                </span>
                {s.consent?.requiereRegularizacion && (
                  <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-orange-100 text-orange-700">
                    Regularizar
                  </span>
                )}
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

      {hasMore && !loading && (
        <div className="flex justify-center mt-5">
          <button
            onClick={() => load(q, cursoFilter, sortBy, students.length, true)}
            className="btn-game btn-gray !px-6"
          >
            Ver más ({total - students.length} restantes)
          </button>
        </div>
      )}

      {modal.open && (
        <StudentModal
          initial={modal.initial}
          onClose={() => setModal({ open: false })}
          onSaved={() => {
            setModal({ open: false });
            load(q, cursoFilter, sortBy, 0, false);
          }}
        />
      )}

      {bulkAI && (
        <BulkAIImport
          mode="estudiantes"
          onClose={() => setBulkAI(false)}
          onDone={() => {
            setBulkAI(false);
            load(q, cursoFilter, sortBy, 0, false);
          }}
        />
      )}
    </div>
  );
}
