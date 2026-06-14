"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CambiarClavePage() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next1.length < 6) {
      setError("La nueva clave debe tener al menos 6 caracteres");
      return;
    }
    if (next1 !== next2) {
      setError("Las claves nuevas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo cambiar la clave");
        return;
      }
      router.replace("/mantenedor");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10">
      <form onSubmit={submit} className="card p-8 w-full max-w-md animate-pop">
        <div className="text-center mb-6">
          <div className="text-6xl mb-2">🔐</div>
          <h1 className="text-2xl font-black text-[#27407a]">Cambia tu clave</h1>
          <p className="text-[#6b7aa0] font-semibold mt-1">
            Por seguridad debes definir una clave nueva.
          </p>
        </div>

        <label className="label-game">Clave actual</label>
        <input
          type="password"
          className="input-game mb-4"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />

        <label className="label-game">Nueva clave</label>
        <input
          type="password"
          className="input-game mb-4"
          value={next1}
          onChange={(e) => setNext1(e.target.value)}
          autoComplete="new-password"
        />

        <label className="label-game">Repite la nueva clave</label>
        <input
          type="password"
          className="input-game mb-5"
          value={next2}
          onChange={(e) => setNext2(e.target.value)}
          autoComplete="new-password"
        />

        {error && (
          <div className="mb-4 text-center font-bold text-[#ef4444]">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-game btn-blue w-full"
        >
          {loading ? "Guardando..." : "Guardar clave"}
        </button>
      </form>
    </main>
  );
}
