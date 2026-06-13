"use client";

import { useEffect, useRef, useState } from "react";
import { loadFaceApi, getSingleDescriptor } from "@/lib/faceapi";

interface Props {
  onCapture: (descriptor: number[]) => void;
  captured: boolean;
}

export default function FaceCapture({ onCapture, captured }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState("Preparando cámara...");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setStatus("Cargando modelos...");
        await loadFaceApi();
        if (!active) return;
        setStatus("Encendiendo cámara...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 480, height: 480 },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
        setStatus("Mira a la cámara y presiona Capturar");
      } catch {
        setStatus("No se pudo acceder a la cámara. Revisa los permisos.");
      }
    })();

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function capture() {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setStatus("Detectando rostro...");
    try {
      const desc = await getSingleDescriptor(videoRef.current);
      if (!desc) {
        setStatus("No se detectó una cara. Acércate e inténtalo de nuevo.");
        return;
      }
      onCapture(Array.from(desc));
      setStatus("¡Cara capturada con éxito! ✅");
    } catch {
      setStatus("Error al procesar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`relative rounded-3xl overflow-hidden border-4 ${
          captured ? "border-green-400" : "border-[#dde6fb]"
        }`}
        style={{ width: 280, height: 280, background: "#0b1020" }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />
        {captured && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
            <span className="text-7xl animate-pop">✅</span>
          </div>
        )}
      </div>

      <p className="text-center font-semibold text-[#5b6b94] min-h-[1.5rem]">
        {status}
      </p>

      <button
        type="button"
        onClick={capture}
        disabled={!ready || busy}
        className={`btn-game ${captured ? "btn-orange" : "btn-purple"} w-full`}
      >
        {captured ? "Volver a capturar" : busy ? "Procesando..." : "📸 Capturar cara"}
      </button>
    </div>
  );
}
