"use client";

import { useState } from "react";
import type { ConsentSection } from "@/lib/consent";

interface Props {
  // Texto efectivo actual (override si existe; si no, el generado).
  initial: ConsentSection[];
  // Texto generado automáticamente (para el botón "Restaurar por defecto").
  defaults: ConsentSection[];
  // Si ya hay un override guardado (para mostrar el estado).
  hasOverride: boolean;
  onClose: () => void;
  onSaved: () => void;
}

// Convierte párrafos a un bloque de texto editable (separados por línea en blanco).
function toBlock(parrafos: string[]): string {
  return parrafos.join("\n\n");
}

// Convierte el bloque editado de vuelta a párrafos (ignora líneas vacías extra).
function toParrafos(block: string): string[] {
  return block
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function ConsentTextEditor({
  initial,
  defaults,
  hasOverride,
  onClose,
  onSaved,
}: Props) {
  const [sections, setSections] = useState<ConsentSection[]>(() =>
    initial.map((s) => ({ titulo: s.titulo, parrafos: [...s.parrafos] }))
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function setTitulo(i: number, value: string) {
    setSections((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, titulo: value } : s))
    );
  }

  function setBody(i: number, value: string) {
    setSections((prev) =>
      prev.map((s, idx) =>
        idx === i ? { ...s, parrafos: value.split("\n") } : s
      )
    );
  }

  function restoreDefault() {
    setSections(
      defaults.map((s) => ({ titulo: s.titulo, parrafos: [...s.parrafos] }))
    );
    setMsg(
      "Cargado el texto por defecto. Pulsa «Restaurar texto automático» para " +
        "que vuelva a actualizarse solo, o «Guardar» para fijarlo."
    );
  }

  async function persist(consentTextos: ConsentSection[] | []) {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentTextos }),
      });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        const d = await res.json().catch(() => ({}));
        setMsg(d.error || "No se pudo guardar.");
      }
    } catch {
      setMsg("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  function save() {
    const clean = sections
      .map((s) => ({
        titulo: s.titulo.trim(),
        parrafos: toParrafos(toBlock(s.parrafos)),
      }))
      .filter((s) => s.titulo && s.parrafos.length > 0);
    if (clean.length === 0) {
      setMsg("El texto no puede quedar vacío.");
      return;
    }
    void persist(clean);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="card w-full max-w-2xl my-8 p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xl font-black text-[#27407a]">
            Texto de autorización y privacidad
          </h3>
          <button
            onClick={onClose}
            className="btn-game btn-gray !py-1.5 !px-3 !text-sm"
          >
            Cerrar
          </button>
        </div>

        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          Este texto se muestra en la política de privacidad y en el documento que
          firma el apoderado. Al guardar, el texto queda <strong>fijo</strong> tal
          como lo dejes (no se actualizará solo con los datos del DPO/proveedor).
          Usa «Restaurar texto automático» para volver al texto generado.
          {hasOverride && (
            <span className="block mt-1 text-[#b45309]">
              ⚠️ Actualmente hay un texto personalizado guardado.
            </span>
          )}
        </p>

        <div className="space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="rounded-2xl border-2 border-[#eef2ff] p-3">
              <label className="label-game">Título de la sección</label>
              <input
                className="input-game mb-2"
                value={s.titulo}
                onChange={(e) => setTitulo(i, e.target.value)}
              />
              <label className="label-game">
                Texto (separa párrafos con una línea en blanco)
              </label>
              <textarea
                className="input-game min-h-[120px] font-medium"
                value={toBlock(s.parrafos)}
                onChange={(e) => setBody(i, e.target.value)}
              />
            </div>
          ))}
        </div>

        {msg && (
          <div className="mt-3 text-sm font-bold text-center text-[#41507a]">
            {msg}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-5">
          <button
            onClick={save}
            disabled={saving}
            className="btn-game btn-blue flex-1 min-w-[140px]"
          >
            {saving ? "Guardando..." : "Guardar texto fijo"}
          </button>
          <button
            onClick={restoreDefault}
            disabled={saving}
            className="btn-game btn-gray"
          >
            Cargar texto por defecto
          </button>
          <button
            onClick={() => void persist([])}
            disabled={saving}
            className="btn-game btn-red"
          >
            Restaurar texto automático
          </button>
        </div>
      </div>
    </div>
  );
}
