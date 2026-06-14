"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { isValidRut } from "@/lib/rut";
import RutInput from "@/components/RutInput";
import FaceCapture from "@/components/FaceCapture";

interface ProgramInfo {
  nombre: string;
  icono: string;
  color: string;
  modalidad: "temporal" | "puntual";
  requiereMembresia: boolean;
  open: boolean;
  expiresAt: string | null;
}

type Step = "loading" | "closed" | "form" | "done";

export default function RegistroProgramaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const [info, setInfo] = useState<ProgramInfo | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [rut, setRut] = useState("");
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/programs/by-token/${token}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setStep("closed");
        setError("Este enlace no es válido.");
        return;
      }
      const data: ProgramInfo = await res.json();
      setInfo(data);
      setStep(data.open ? "form" : "closed");
    } catch {
      setStep("closed");
      setError("Error de conexión.");
    }
  }, [token]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!isValidRut(rut)) {
      setError("Ese RUT no es válido. Revísalo.");
      return;
    }
    if (!descriptor) {
      setError("Primero captura tu cara.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/programs/by-token/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut, faceDescriptor: descriptor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "No se pudo registrar.");
        return;
      }
      setResultMsg(
        data.duplicate
          ? `${data.nombre || ""}, ya estabas registrado. ✅`
          : `¡Registro exitoso${data.nombre ? ", " + data.nombre : ""}! ✅`
      );
      setStep("done");
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  const accent = info?.color || "#4f7cff";

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {step === "loading" && (
          <div className="card p-8 text-center">
            <div className="text-2xl font-bold text-[#5b6b94] animate-pulse">
              Cargando...
            </div>
          </div>
        )}

        {step === "closed" && (
          <div className="card p-8 text-center animate-pop border-4 border-amber-200">
            <div className="text-7xl mb-3">⏳</div>
            <h1 className="text-2xl font-black text-[#b45309] mb-2">
              Registro no disponible
            </h1>
            <p className="text-[#5b6b94] font-semibold text-lg">
              {error ||
                "El registro de este programa está cerrado en este momento. Pídele a tu profesor que lo active."}
            </p>
          </div>
        )}

        {step === "form" && info && (
          <form onSubmit={submit} className="card p-7 animate-pop">
            <div className="text-center mb-5">
              <div className="text-6xl mb-2">{info.icono}</div>
              <h1 className="text-2xl font-black" style={{ color: accent }}>
                {info.nombre}
              </h1>
              <p className="text-[#6b7aa0] font-semibold mt-1">
                Escribe tu RUT y captura tu cara para registrarte.
              </p>
            </div>

            <label className="label-game">RUT</label>
            <RutInput
              value={rut}
              onChange={setRut}
              center
              className="input-game mb-4"
            />

            <FaceCapture onCapture={setDescriptor} captured={Boolean(descriptor)} />

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
              {loading ? "Registrando..." : "Registrarme ✅"}
            </button>
          </form>
        )}

        {step === "done" && (
          <div className="card p-8 text-center animate-pop border-4 border-green-200">
            <div className="text-7xl mb-3">🎉</div>
            <h1 className="text-3xl font-black text-[#22a558] mb-2">¡Listo!</h1>
            <p className="text-[#5b6b94] font-semibold text-lg">{resultMsg}</p>
          </div>
        )}
      </div>
    </main>
  );
}
