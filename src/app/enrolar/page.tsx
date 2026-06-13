"use client";

import { useState } from "react";
import Link from "next/link";
import { isValidRut } from "@/lib/rut";
import RutInput from "@/components/RutInput";
import CursoSelect from "@/components/CursoSelect";
import FaceCapture from "@/components/FaceCapture";

type Step = "rut" | "form" | "blocked" | "done";

export default function EnrolarPage() {
  const [step, setStep] = useState<Step>("rut");
  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [curso, setCurso] = useState("");
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // guest = se está enrolando por enrolamiento abierto, sin estar en el listado.
  const [guest, setGuest] = useState(false);

  async function checkRut(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isValidRut(rut)) {
      setError("Ese RUT no es válido. Revísalo.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/enroll/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut }),
      });
      const data = await res.json();
      if (!data.allowed) {
        setStep("blocked");
        return;
      }
      setGuest(!data.inList);
      setNombre(data.nombre || "");
      setApellidos(data.apellidos || "");
      setCurso(data.curso || "");
      setStep("form");
    } catch {
      setError("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nombre.trim() || !apellidos.trim()) {
      setError("Escribe tu nombre y apellidos.");
      return;
    }
    if (!curso) {
      setError("Selecciona tu curso.");
      return;
    }
    if (!descriptor) {
      setError("Primero captura tu cara.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rut,
          nombre,
          apellidos,
          curso,
          faceDescriptor: descriptor,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "NOT_ALLOWED") {
          setStep("blocked");
          return;
        }
        setError(data.error || "No se pudo enrolar.");
        return;
      }
      setStep("done");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {step === "rut" && (
          <form onSubmit={checkRut} className="card p-7 animate-pop">
            <div className="text-center mb-5">
              <div className="text-6xl mb-2">✋</div>
              <h1 className="text-2xl font-black text-[#27407a]">
                Enrólate al almuerzo
              </h1>
              <p className="text-[#6b7aa0] font-semibold mt-1">
                Primero, escribe tu RUT
              </p>
            </div>
            <label className="label-game">RUT</label>
            <RutInput
              value={rut}
              onChange={setRut}
              center
              className="input-game mb-4"
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
              {loading ? "Verificando..." : "Continuar →"}
            </button>
            <Link
              href="/"
              className="block text-center mt-5 font-bold text-[#6b7aa0]"
            >
              ← Volver
            </Link>
          </form>
        )}

        {step === "form" && (
          <form onSubmit={submit} className="card p-7 animate-pop">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-black text-[#27407a]">
                {guest ? "Completa tu enrolamiento 📝" : "¡Genial! Estás en la lista 🎉"}
              </h1>
              <p className="text-[#6b7aa0] font-semibold mt-1">
                Completa los datos que falten y captura tu cara
              </p>
            </div>

            {guest && (
              <div className="mb-4 rounded-2xl bg-[#fff8e6] border-2 border-[#ffe08a] p-3 text-center">
                <p className="font-bold text-[#8a6d1a] text-sm">
                  ⚠️ Tu RUT no está en el listado de almuerzo. Puedes enrolarte,
                  pero <strong>esto no asegura tu acceso al almuerzo</strong>. Si
                  necesitas el beneficio, acércate a Orientación.
                </p>
              </div>
            )}

            <label className="label-game">Nombre</label>
            <input
              className="input-game mb-4"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
            />

            <label className="label-game">Apellidos</label>
            <input
              className="input-game mb-4"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Tus apellidos"
            />

            <label className="label-game">Curso</label>
            <div className="mb-5">
              <CursoSelect value={curso} onChange={setCurso} required />
            </div>

            <FaceCapture
              onCapture={setDescriptor}
              captured={Boolean(descriptor)}
            />

            {error && (
              <div className="mt-4 text-center font-bold text-[#ef4444]">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !descriptor}
              className="btn-game btn-green w-full mt-5"
            >
              {loading ? "Guardando..." : "Finalizar enrolamiento ✅"}
            </button>
          </form>
        )}

        {step === "blocked" && (
          <div className="card p-8 text-center animate-pop border-4 border-red-200">
            <div className="text-7xl mb-3">🙋</div>
            <h1 className="text-2xl font-black text-[#ef4444] mb-2">
              Tu RUT no está en el listado
            </h1>
            <p className="text-[#5b6b94] font-semibold text-lg">
              Debes acercarte a <strong>Orientación</strong> para conversar tu
              caso y poder almorzar.
            </p>
            <button
              onClick={() => {
                setStep("rut");
                setError("");
                setGuest(false);
              }}
              className="btn-game btn-gray w-full mt-6"
            >
              Intentar con otro RUT
            </button>
            <Link
              href="/"
              className="block text-center mt-4 font-bold text-[#6b7aa0]"
            >
              ← Volver al inicio
            </Link>
          </div>
        )}

        {step === "done" && (
          <div className="card p-8 text-center animate-pop border-4 border-green-200">
            <div className="text-7xl mb-3">🎉</div>
            <h1 className="text-3xl font-black text-[#22a558] mb-2">
              ¡Listo!
            </h1>
            <p className="text-[#5b6b94] font-semibold text-lg">
              Ya estás enrolado. Ahora puedes ingresar al almuerzo mostrando tu
              cara en la tablet de la entrada.
            </p>
            <Link href="/" className="btn-game btn-blue w-full mt-6">
              Volver al inicio
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
