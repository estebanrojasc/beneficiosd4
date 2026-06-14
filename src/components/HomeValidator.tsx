"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setKioskToken } from "@/lib/kiosk";

// Validador de la página principal: el docente/coordinador escribe la clave del
// programa y, según esa clave, se abre la validación de ESE programa.
export default function HomeValidator() {
  const router = useRouter();
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const c = clave.trim();
    if (!c) {
      setError("Escribe la clave del programa.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch(
        `/api/programs/resolve?clave=${encodeURIComponent(c)}`,
        { cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "No se pudo validar la clave.");
        return;
      }
      // Guardamos la clave como token del kiosko (autoriza las llamadas) y
      // abrimos el validador del programa resuelto.
      setKioskToken(c);
      router.push(`/validar?program=${data.id}`);
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={start} className="card p-6 w-full">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-2xl">🔓</span>
        <h2 className="text-xl font-black text-[#27407a]">Validar ingreso</h2>
      </div>
      <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
        Escribe la clave del programa para abrir su validación.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          className="input-game flex-1"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Clave del programa"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-game btn-blue whitespace-nowrap"
        >
          {loading ? "Abriendo..." : "Validar →"}
        </button>
      </div>
      {error && (
        <div className="mt-3 font-bold text-[#ef4444] text-center">{error}</div>
      )}
    </form>
  );
}
