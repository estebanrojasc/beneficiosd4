"use client";

import { useCallback, useEffect, useState } from "react";

interface AuditItem {
  action: string;
  actor: string;
  actorType: string;
  rut?: string;
  studentId?: string;
  detail?: string;
  ip?: string;
  at: string;
}

const ACTION_LABELS: Record<string, string> = {
  "descriptors.download": "Descarga de descriptores",
  "face.enroll": "Registro de cara",
  "face.update": "Actualización de cara",
  "consent.grant": "Autorización registrada",
  "consent.revoke": "Autorización revocada",
  "student.delete": "Estudiante eliminado",
  "data.export": "Exportación de datos",
  "retention.purge": "Borrado por retención",
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

function actionLabel(a: string): string {
  return ACTION_LABELS[a] || a;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE = 50;

export default function AuditoriaTab() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [rut, setRut] = useState("");

  const load = useCallback(
    async (skip: number, append: boolean) => {
      setLoading(true);
      setError("");
      try {
        const sp = new URLSearchParams();
        sp.set("limit", String(PAGE));
        sp.set("skip", String(skip));
        if (action) sp.set("action", action);
        if (rut.trim()) sp.set("rut", rut.trim());
        const r = await fetch(`/api/audit?${sp.toString()}`);
        if (!r.ok) throw new Error("No se pudo cargar la auditoría.");
        const data = await r.json();
        setTotal(data.total);
        setHasMore(data.hasMore);
        setItems((prev) =>
          append ? [...prev, ...data.items] : data.items
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoading(false);
      }
    },
    [action, rut]
  );

  useEffect(() => {
    const t = window.setTimeout(() => void load(0, false), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="text-lg font-black text-[#27407a] mb-1">
          📜 Auditoría de datos
        </h2>
        <p className="text-sm font-bold text-[#6b7aa0]">
          Registro de accesos, descargas, cambios y borrados de datos
          biométricos y personales (Ley N° 21.719). Total: {total}.
        </p>

        <div className="flex flex-wrap gap-2 mt-3">
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="input-game !py-2 !w-auto"
          >
            <option value="">Todas las acciones</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </select>
          <input
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="Filtrar por RUT"
            className="input-game !py-2 !w-auto"
          />
        </div>
      </div>

      {error && (
        <div className="card p-4 text-[#c0392b] font-bold">{error}</div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#9aa6bf] font-extrabold border-b-2 border-[#eef2ff]">
              <th className="p-3">Fecha</th>
              <th className="p-3">Acción</th>
              <th className="p-3">Quién</th>
              <th className="p-3">RUT</th>
              <th className="p-3">Detalle</th>
              <th className="p-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr
                key={`${it.at}-${i}`}
                className="border-b border-[#f1f4fb] align-top"
              >
                <td className="p-3 whitespace-nowrap font-bold text-[#41507a]">
                  {fmt(it.at)}
                </td>
                <td className="p-3 font-extrabold text-[#27407a]">
                  {actionLabel(it.action)}
                </td>
                <td className="p-3 font-bold text-[#41507a]">
                  {it.actor}
                  <span className="block text-[11px] text-[#9aa6bf]">
                    {it.actorType}
                  </span>
                </td>
                <td className="p-3 font-mono text-[#41507a]">{it.rut || "—"}</td>
                <td className="p-3 text-[#5b6b94]">{it.detail || "—"}</td>
                <td className="p-3 font-mono text-[11px] text-[#9aa6bf]">
                  {it.ip || "—"}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[#9aa6bf] font-bold">
                  Sin registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {hasMore && (
          <button
            onClick={() => load(items.length, true)}
            disabled={loading}
            className="btn-game btn-gray"
          >
            {loading ? "Cargando..." : "Cargar más"}
          </button>
        )}
      </div>
    </div>
  );
}
