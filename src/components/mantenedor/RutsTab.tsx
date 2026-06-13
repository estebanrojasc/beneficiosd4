"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRut, isValidRut } from "@/lib/rut";
import RutInput from "@/components/RutInput";
import CursoSelect from "@/components/CursoSelect";

interface RutRow {
  _id: string;
  rut: string;
  nombre?: string;
  apellidos?: string;
  curso?: string;
}

export default function RutsTab() {
  const [rows, setRows] = useState<RutRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [newRut, setNewRut] = useState("");
  const [newNombre, setNewNombre] = useState("");
  const [newApellidos, setNewApellidos] = useState("");
  const [newCurso, setNewCurso] = useState("");
  const [bulk, setBulk] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/allowed-ruts?q=${encodeURIComponent(query)}`
      );
      if (res.ok) setRows(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  async function addOne(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setError("");
    if (!isValidRut(newRut)) {
      setError("RUT inválido. Revísalo.");
      return;
    }
    const res = await fetch("/api/allowed-ruts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rut: newRut,
        nombre: newNombre || undefined,
        apellidos: newApellidos || undefined,
        curso: newCurso || undefined,
      }),
    });
    if (res.ok) {
      setNewRut("");
      setNewNombre("");
      setNewApellidos("");
      setNewCurso("");
      setMsg("✅ RUT agregado correctamente");
      load(q);
    } else {
      const d = await res.json();
      setError(d.error || "No se pudo agregar");
    }
  }

  async function importBulk() {
    setMsg("");
    setError("");
    const res = await fetch("/api/allowed-ruts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulk }),
    });
    const d = await res.json();
    if (res.ok) {
      setMsg(`✅ Agregados: ${d.added} · Inválidos: ${d.invalid}`);
      setBulk("");
      load(q);
    } else {
      setError(d.error || "Error en la carga");
    }
  }

  async function remove(rut: string) {
    if (!confirm(`¿Quitar ${formatRut(rut)} de la lista?`)) return;
    await fetch(`/api/allowed-ruts?rut=${encodeURIComponent(rut)}`, {
      method: "DELETE",
    });
    load(q);
  }

  return (
    <div className="animate-pop">
      {/* Buscador siempre arriba y accesible */}
      <input
        className="input-game mb-3"
        placeholder="🔍 Buscar RUT o nombre..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {/* Acordeón para agregar (colapsado por defecto) */}
      <button
        onClick={() => setAddOpen((o) => !o)}
        className="btn-game btn-blue w-full mb-3 !justify-between"
      >
        <span>➕ Agregar RUT autorizado</span>
        <span>{addOpen ? "▲" : "▼"}</span>
      </button>

      {addOpen && (
      <div className="card p-4 mb-4">
        <form onSubmit={addOne} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="label-game">RUT *</label>
            <RutInput value={newRut} onChange={setNewRut} />
          </div>
          <div>
            <label className="label-game">Nombre</label>
            <input
              className="input-game"
              placeholder="Nombre"
              value={newNombre}
              onChange={(e) => setNewNombre(e.target.value)}
            />
          </div>
          <div>
            <label className="label-game">Apellidos</label>
            <input
              className="input-game"
              placeholder="Apellidos"
              value={newApellidos}
              onChange={(e) => setNewApellidos(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">Curso</label>
            <CursoSelect value={newCurso} onChange={setNewCurso} />
          </div>
          <button type="submit" className="btn-game btn-blue sm:col-span-2">
            ➕ Agregar
          </button>
        </form>

        <button
          onClick={() => setBulkOpen((b) => !b)}
          className="mt-3 font-bold text-[#4f7cff]"
        >
          {bulkOpen ? "▲ Ocultar carga masiva" : "▼ Carga masiva (pegar lista)"}
        </button>

        {bulkOpen && (
          <div className="mt-3">
            <p className="text-sm text-[#6b7aa0] font-semibold mb-2">
              Una línea por estudiante. Formato:{" "}
              <code>RUT;Nombre;Apellidos;Nivel;Ciclo;Letra</code>
              <br />
              También vale <strong>solo el RUT</strong> (el estudiante completa
              el resto al enrolarse).
            </p>
            <textarea
              className="input-game min-h-[140px] font-mono text-sm"
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder={
                "12.345.678-9;Juan;Pérez González;3;Básico;A\n9.876.543-2;Ana;Soto Díaz;4;Básico;B\n11.222.333-4"
              }
            />
            <button
              onClick={importBulk}
              className="btn-game btn-purple mt-3"
            >
              📥 Importar lista
            </button>
          </div>
        )}

        {error && (
          <div className="mt-3 font-bold text-center text-[#ef4444]">{error}</div>
        )}
        {msg && (
          <div className="mt-3 font-bold text-center text-[#22a558]">{msg}</div>
        )}
      </div>
      )}

      {loading && (
        <div className="text-center text-[#6b7aa0] font-bold py-4">
          Cargando...
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {rows.map((r) => (
          <div
            key={r._id}
            className="card p-3 flex items-center justify-between"
          >
            <div className="min-w-0">
              <div className="font-black text-[#27407a]">
                {formatRut(r.rut)}
              </div>
              {(r.nombre || r.apellidos || r.curso) && (
                <div className="text-sm text-[#6b7aa0] font-semibold truncate">
                  {[r.nombre, r.apellidos].filter(Boolean).join(" ")}
                  {r.curso ? ` · ${r.curso}` : ""}
                </div>
              )}
            </div>
            <button
              onClick={() => remove(r.rut)}
              className="btn-game btn-red !py-1 !px-2.5 !text-sm shrink-0"
            >
              🗑️
            </button>
          </div>
        ))}
      </div>

      {!loading && rows.length === 0 && (
        <div className="card p-8 text-center text-[#6b7aa0] font-semibold">
          La lista está vacía. Agrega RUTs autorizados para el almuerzo.
        </div>
      )}
    </div>
  );
}
