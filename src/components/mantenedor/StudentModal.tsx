"use client";

import { useCallback, useEffect, useState } from "react";
import FaceCapture from "@/components/FaceCapture";
import RutInput from "@/components/RutInput";
import CursoSelect from "@/components/CursoSelect";
import { splitNombreCompleto } from "@/lib/curso";
import type { Program } from "@/lib/types";
import { normalizeRut } from "@/lib/rut";

export interface StudentLite {
  _id?: string;
  nombre: string;
  apellidos?: string;
  curso: string;
  anio?: number;
  rut: string;
  enrolled?: boolean;
}

interface Props {
  initial?: Partial<StudentLite>;
  onClose: () => void;
  onSaved: () => void;
}

function getInitialForm(initial?: Partial<StudentLite>) {
  if (!initial) {
    return {
      nombre: "",
      apellidos: "",
      curso: "",
      rut: "",
    };
  }

  let nombre = initial.nombre || "";
  let apellidos = initial.apellidos || "";

  if (initial.apellidos === undefined && initial.nombre?.includes(" ")) {
    const split = splitNombreCompleto(initial.nombre);
    nombre = split.nombre;
    apellidos = split.apellidos;
  }

  return {
    nombre,
    apellidos,
    curso: initial.curso || "",
    rut: initial.rut || "",
  };
}

export default function StudentModal({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?._id);
  const initialForm = getInitialForm(initial);
  const [nombre, setNombre] = useState(initialForm.nombre);
  const [apellidos, setApellidos] = useState(initialForm.apellidos);
  const [curso, setCurso] = useState(initialForm.curso);
  const [rut, setRut] = useState(initialForm.rut);
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Programas (con lista) a los que pertenece el estudiante.
  const [programs, setPrograms] = useState<Program[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [initialMemberOf, setInitialMemberOf] = useState<Set<string>>(new Set());

  const loadPrograms = useCallback(async () => {
    try {
      const res = await fetch("/api/programs", { cache: "no-store" });
      const all: Program[] = res.ok ? await res.json() : [];
      setPrograms(all.filter((p) => p.requiereMembresia));
    } catch {
      setPrograms([]);
    }
    const r = (initial?.rut || "").trim();
    if (r) {
      try {
        const res = await fetch(
          `/api/students/memberships?rut=${encodeURIComponent(r)}`,
          { cache: "no-store" }
        );
        const data = res.ok ? await res.json() : { programIds: [] };
        const set = new Set<string>(data.programIds || []);
        setMemberOf(set);
        setInitialMemberOf(new Set(set));
      } catch {
        /* sin membresías */
      }
    }
  }, [initial?.rut]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadPrograms(), 0);
    return () => window.clearTimeout(t);
  }, [loadPrograms]);

  function toggleProgram(id: string) {
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Aplica las altas/bajas de membresía según lo seleccionado.
  async function syncMemberships() {
    const r = normalizeRut(rut);
    if (!r) return;
    const toAdd = [...memberOf].filter((id) => !initialMemberOf.has(id));
    const toRemove = [...initialMemberOf].filter((id) => !memberOf.has(id));
    await Promise.all([
      ...toAdd.map((id) =>
        fetch(`/api/programs/${id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rut: r, nombre, apellidos, curso }),
        }).catch(() => {})
      ),
      ...toRemove.map((id) =>
        fetch(
          `/api/programs/${id}/members?rut=${encodeURIComponent(r)}`,
          { method: "DELETE" }
        ).catch(() => {})
      ),
    ]);
  }

  async function save(force = false) {
    setError("");
    if (!nombre.trim() || !apellidos.trim() || !curso || !rut.trim()) {
      setError("Completa nombre, apellidos, curso y RUT.");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        nombre,
        apellidos,
        curso,
        rut,
      };
      if (descriptor) payload.faceDescriptor = descriptor;
      if (force) payload.force = true;

      const res = await fetch(
        isEdit ? `/api/students/${initial!._id}` : "/api/students",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DUPLICATE_FACE") {
          const m = data.match || {};
          const ok = window.confirm(
            `⚠️ Esta cara se parece mucho a ${m.nombre || "otro estudiante"}` +
              `${m.curso ? ` (${m.curso})` : ""}` +
              `${m.score ? ` · ${m.score}% de similitud` : ""}.\n\n` +
              "¿Son personas distintas (gemelos o hermanos) y deseas enrolar de todos modos?"
          );
          if (ok) {
            await save(true);
            return;
          }
          setError("Enrolamiento cancelado: la cara ya estaba registrada.");
          return;
        }
        setError(data.error || "No se pudo guardar.");
        return;
      }
      await syncMemberships();
      onSaved();
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto">
      <div className="card p-6 w-full max-w-lg my-auto animate-pop">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black text-[#27407a]">
            {isEdit ? "Editar estudiante" : "Nuevo estudiante"}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-black text-[#9aa6bf]"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-game">Nombre</label>
            <input
              className="input-game"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Juan"
            />
          </div>
          <div>
            <label className="label-game">Apellidos</label>
            <input
              className="input-game"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Ej: Pérez González"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">Curso</label>
            <CursoSelect value={curso} onChange={setCurso} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">RUT</label>
            <RutInput value={rut} onChange={setRut} />
          </div>
        </div>

        {programs.length > 0 && (
          <div className="mt-5">
            <label className="label-game">Programas (listas)</label>
            <p className="text-xs text-[#9aa6bf] font-semibold mb-2">
              Marca a qué listas pertenece. Puede estar en ninguna o en varias.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {programs.map((p) => {
                const checked = memberOf.has(p._id!);
                return (
                  <label
                    key={p._id}
                    className={`flex items-center gap-2 rounded-xl border-2 p-2 cursor-pointer select-none ${
                      checked
                        ? "border-[#4f7cff] bg-[#f4f8ff]"
                        : "border-[#eef2ff]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProgram(p._id!)}
                      className="w-5 h-5 accent-[#4f7cff]"
                    />
                    <span className="text-lg">{p.icono}</span>
                    <span className="font-bold text-[#27407a] text-sm truncate">
                      {p.nombre}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl bg-[#f6f8ff] p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#41507a]">
              Enrolar cara{" "}
              {descriptor
                ? "✅"
                : initial?.enrolled
                ? "(ya enrolado)"
                : "(opcional)"}
            </span>
            <button
              type="button"
              onClick={() => setShowCapture((s) => !s)}
              className="btn-game btn-purple !py-2 !px-4 !text-base"
            >
              {showCapture ? "Ocultar cámara" : "📸 Capturar"}
            </button>
          </div>
          {showCapture && (
            <div className="mt-4">
              <FaceCapture
                onCapture={setDescriptor}
                captured={Boolean(descriptor)}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 text-center font-bold text-[#ef4444]">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save()}
            disabled={loading}
            className="btn-game btn-green flex-1"
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={onClose} className="btn-game btn-gray flex-1">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
