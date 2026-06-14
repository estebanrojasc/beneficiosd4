"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useBranding, BrandLogo } from "@/components/Brand";

export default function LoginPage() {
  const router = useRouter();
  const { name, hasLogo } = useBranding();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo ingresar");
        return;
      }
      router.push("/mantenedor");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10">
      <form
        onSubmit={submit}
        className="card p-8 w-full max-w-md animate-pop"
      >
        <div className="text-center mb-6">
          <div className="mb-2 flex justify-center">
            <BrandLogo hasLogo={hasLogo} fallback="🔑" size={hasLogo ? 80 : 64} />
          </div>
          {name && (
            <div className="font-black text-[#27407a] text-lg">{name}</div>
          )}
          <h1 className="text-2xl font-black text-[#27407a]">
            Ingreso del docente
          </h1>
          <p className="text-[#6b7aa0] font-semibold mt-1">
            Accede al mantenedor
          </p>
        </div>

        <label className="label-game">Usuario</label>
        <input
          className="input-game mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="admin"
        />

        <label className="label-game">Clave</label>
        <input
          type="password"
          className="input-game mb-5"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          placeholder="••••••••"
        />

        {error && (
          <div className="mb-4 text-center font-bold text-[#ef4444]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-game btn-blue w-full"
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        <Link
          href="/"
          className="block text-center mt-5 font-bold text-[#6b7aa0]"
        >
          ← Volver al inicio
        </Link>
      </form>
    </main>
  );
}
