"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadFaceApi, getSingleDescriptor } from "@/lib/faceapi";

interface Props {
  onCapture: (descriptor: number[]) => void;
  captured: boolean;
}

export default function FaceCapture({ onCapture, captured }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const countdownTimer = useRef<number | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState("Preparando cámara...");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  // Enciende (o reinicia) la cámara con la orientación actual.
  const startStream = useCallback(async () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingRef.current, width: 480, height: 480 },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setStatus("Cargando modelos...");
        await loadFaceApi();
        if (!active) return;
        setStatus("Encendiendo cámara...");
        await startStream();
        if (!active) {
          streamRef.current?.getTracks().forEach((t) => t.stop());
          return;
        }
        setReady(true);
        setStatus("Mira a la cámara y presiona Capturar");
      } catch {
        setStatus("No se pudo acceder a la cámara. Revisa los permisos.");
      }
    })();

    return () => {
      active = false;
      if (countdownTimer.current) window.clearTimeout(countdownTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [startStream]);

  // Cambia entre cámara frontal y trasera (girar cámara).
  const flipCamera = useCallback(async () => {
    if (busy || countdown !== null) return;
    const next = facingRef.current === "user" ? "environment" : "user";
    facingRef.current = next;
    setFacingMode(next);
    try {
      await startStream();
    } catch {
      // Si la cámara pedida no existe, volvemos a la frontal.
      facingRef.current = "user";
      setFacingMode("user");
      await startStream().catch(() => {});
    }
  }, [busy, countdown, startStream]);

  const capture = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    setStatus("Detectando rostro...");
    try {
      const desc = await getSingleDescriptor(videoRef.current);
      if (!desc) {
        setFailed(true);
        setStatus("No se detectó una cara. Acércate e inténtalo de nuevo.");
        return;
      }
      setFailed(false);
      onCapture(Array.from(desc));
      setStatus("¡Cara capturada con éxito! ✅");
    } catch {
      setFailed(true);
      setStatus("Error al procesar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }, [busy, onCapture]);

  // Inicia la cuenta regresiva 3-2-1 y captura automáticamente al llegar a 0.
  const startCountdown = useCallback(() => {
    if (!ready || busy || countdown !== null) return;
    setFailed(false);
    setStatus("Prepárate...");
    let n = 3;
    setCountdown(n);
    const tick = () => {
      n -= 1;
      if (n <= 0) {
        setCountdown(null);
        capture();
      } else {
        setCountdown(n);
        countdownTimer.current = window.setTimeout(tick, 800);
      }
    };
    countdownTimer.current = window.setTimeout(tick, 800);
  }, [ready, busy, countdown, capture]);

  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current) window.clearTimeout(countdownTimer.current);
    countdownTimer.current = null;
    setCountdown(null);
    setStatus("Mira a la cámara y presiona Capturar");
  }, []);

  const counting = countdown !== null;

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
          className={`w-full h-full object-cover ${
            facingMode === "user" ? "-scale-x-100" : ""
          }`}
        />

        {/* Botón sutil para girar la cámara (frontal/trasera). */}
        {ready && !captured && (
          <button
            type="button"
            onClick={flipCamera}
            disabled={busy || counting}
            aria-label="Girar cámara"
            title="Girar cámara"
            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/45 text-white text-lg flex items-center justify-center backdrop-blur-sm hover:bg-black/65 transition disabled:opacity-40"
          >
            🔄
          </button>
        )}

        {/* Cuenta regresiva grande sobre el video. */}
        {counting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span
              key={countdown}
              className="text-white font-black animate-pop"
              style={{ fontSize: 120, lineHeight: 1, textShadow: "0 4px 16px rgba(0,0,0,.5)" }}
            >
              {countdown}
            </span>
          </div>
        )}

        {captured && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/30">
            <span className="text-7xl animate-pop">✅</span>
          </div>
        )}
      </div>

      <p className="text-center font-semibold text-[#5b6b94] min-h-[1.5rem]">
        {status}
      </p>

      {counting ? (
        <button
          type="button"
          onClick={cancelCountdown}
          className="btn-game btn-gray w-full"
        >
          Cancelar ({countdown})
        </button>
      ) : (
        <button
          type="button"
          onClick={startCountdown}
          disabled={!ready || busy}
          className={`btn-game ${
            captured ? "btn-orange" : failed ? "btn-orange" : "btn-purple"
          } w-full`}
        >
          {captured
            ? "Volver a capturar"
            : busy
            ? "Procesando..."
            : failed
            ? "🔄 Reintentar captura"
            : "📸 Capturar cara"}
        </button>
      )}
    </div>
  );
}
