"use client";

import { useState } from "react";
import FaceCapture from "@/components/FaceCapture";
import RutInput from "@/components/RutInput";
import CursoSelect from "@/components/CursoSelect";
import { splitNombreCompleto } from "@/lib/curso";

export interface StudentLite {
  _id?: string;
  nombre: string;
  apellidos?: string;
  curso: string;
  anio?: number;
  rut: string;
  perteneceAlmuerzo: boolean;
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
      perteneceAlmuerzo: true,
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
    perteneceAlmuerzo: initial.perteneceAlmuerzo ?? true,
  };
}

export default function StudentModal({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?._id);
  const initialForm = getInitialForm(initial);
  const [nombre, setNombre] = useState(initialForm.nombre);
  const [apellidos, setApellidos] = useState(initialForm.apellidos);
  const [curso, setCurso] = useState(initialForm.curso);
  const [rut, setRut] = useState(initialForm.rut);
  const [perteneceAlmuerzo, setPertenece] = useState(
    initialForm.perteneceAlmuerzo
  );
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function save() {
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
        perteneceAlmuerzo,
      };
      if (descriptor) payload.faceDescriptor = descriptor;

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
        setError(data.error || "No se pudo guardar.");
        return;
      }
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

        <label className="flex items-center gap-3 mt-4 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={perteneceAlmuerzo}
            onChange={(e) => setPertenece(e.target.checked)}
            className="w-6 h-6 accent-[#22c55e]"
          />
          <span className="font-bold text-[#41507a]">
            Pertenece al almuerzo
          </span>
        </label>

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
            onClick={save}
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
