"use client";

import { useCallback, useEffect, useState } from "react";
import { formatRut } from "@/lib/rut";

interface AttendanceRow {
  rut: string;
  nombre: string;
  curso: string;
  method: "facial" | "manual";
  timestamp: string;
}

export default function AttendanceTab() {
  const [fecha, setFecha] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/attendance?fecha=${encodeURIComponent(fecha)}`
      );
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const facial = records.filter((r) => r.method === "facial").length;
  const manual = records.filter((r) => r.method === "manual").length;

  return (
    <div className="animate-pop">
      <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center">
        <input
          type="date"
          className="input-game w-auto"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
        />
        <button onClick={load} className="btn-game btn-blue">
          🔄 Actualizar
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card p-4 text-center">
          <div className="text-3xl font-black text-[#4f7cff]">{total}</div>
          <div className="text-sm font-bold text-[#6b7aa0]">Total</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-black text-[#22c55e]">{facial}</div>
          <div className="text-sm font-bold text-[#6b7aa0]">Facial</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-black text-[#ffab1a]">{manual}</div>
          <div className="text-sm font-bold text-[#6b7aa0]">Manual</div>
        </div>
      </div>

      {loading && (
        <div className="text-center text-[#6b7aa0] font-bold py-4">
          Cargando...
        </div>
      )}

      {!loading && records.length === 0 && (
        <div className="card p-8 text-center text-[#6b7aa0] font-semibold">
          Nadie ha ingresado este día todavía.
        </div>
      )}

      <div className="space-y-2">
        {records.map((r, i) => (
          <div
            key={`${r.rut}-${i}`}
            className="card p-3 flex items-center justify-between"
          >
            <div>
              <div className="font-black text-[#27407a]">
                {r.nombre || "Sin nombre"}
              </div>
              <div className="text-sm text-[#6b7aa0] font-semibold">
                {formatRut(r.rut)} · {r.curso}
              </div>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                  r.method === "facial"
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {r.method === "facial" ? "📷 Facial" : "✍️ Manual"}
              </span>
              <div className="text-xs text-[#9aa6bf] mt-1">
                {new Date(r.timestamp).toLocaleTimeString("es-CL")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
