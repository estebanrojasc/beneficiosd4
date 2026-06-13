"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loadFaceApi, getSingleDescriptor, findBestMatch } from "@/lib/faceapi";
import type { FaceDescriptorEntry } from "@/lib/types";
import {
  loadDescriptors,
  markAttendance,
  syncQueue,
  pendingCount,
  setKioskToken,
  getKioskToken,
  loadTodayRuts,
  searchStudents,
  type StudentSearchResult,
} from "@/lib/kiosk";
import { formatRut } from "@/lib/rut";
import { fullName } from "@/lib/curso";

type ResultType = "green" | "already" | "red" | "unknown" | null;

interface ResultState {
  type: ResultType;
  nombre?: string;
  curso?: string;
  message?: string;
}

const COOLDOWN_MS = 3500;
const DETECT_INTERVAL_MS = 700;

export default function ValidarPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const entriesRef = useRef<FaceDescriptorEntry[]>([]);
  const processingRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const markedTodayRef = useRef<Set<string>>(new Set());
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ambiguousRef = useRef(false);
  const stoppedRef = useRef(false);
  const modelPromiseRef = useRef<Promise<void> | null>(null);

  const [phase, setPhase] = useState<"setup" | "loading" | "ready" | "error">(
    "loading"
  );
  const [statusText, setStatusText] = useState("Iniciando...");
  const [setupError, setSetupError] = useState("");
  const [result, setResult] = useState<ResultState>({ type: null });
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [count, setCount] = useState(0);
  const [tokenInput, setTokenInput] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [ambiguous, setAmbiguous] = useState<FaceDescriptorEntry[] | null>(
    null
  );

  // Empieza (una sola vez) la carga del modelo. Puede correr en segundo plano
  // mientras se pide la clave del kiosko.
  const ensureModel = useCallback(() => {
    if (!modelPromiseRef.current) {
      modelPromiseRef.current = loadFaceApi()
        .then(() => {
          setModelReady(true);
        })
        .catch((err) => {
          // Permitimos reintentar si falló.
          modelPromiseRef.current = null;
          throw err;
        });
    }
    return modelPromiseRef.current;
  }, []);

  const stopKiosk = useCallback(() => {
    stoppedRef.current = true;
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const goHome = useCallback(() => {
    stopKiosk();
    router.push("/");
  }, [router, stopKiosk]);

  const updateAmbiguous = useCallback((entries: FaceDescriptorEntry[] | null) => {
    ambiguousRef.current = Boolean(entries);
    setAmbiguous(entries);
  }, []);

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  const showResult = useCallback((r: ResultState) => {
    setResult(r);
    cooldownUntilRef.current = Date.now() + COOLDOWN_MS;
    window.setTimeout(() => {
      setResult({ type: null });
    }, COOLDOWN_MS);
  }, []);

  const handleMatchedEntry = useCallback(
    async (entry: FaceDescriptorEntry) => {
      if (!entry.perteneceAlmuerzo) {
        showResult({
          type: "red",
          nombre: entry.nombre,
          curso: entry.curso,
          message: "No pertenece al almuerzo",
        });
        return;
      }
      if (markedTodayRef.current.has(entry.rut)) {
        showResult({
          type: "already",
          nombre: entry.nombre,
          curso: entry.curso,
          message: "Ya almorzaste hoy 😊",
        });
        return;
      }
      markedTodayRef.current.add(entry.rut);
      setCount((c) => c + 1);
      showResult({
        type: "green",
        nombre: entry.nombre,
        curso: entry.curso,
        message: "¡Puede ingresar!",
      });
      const res = await markAttendance({
        rut: entry.rut,
        nombre: entry.nombre,
        curso: entry.curso,
        method: "facial",
      });
      if (res.offline) refreshPending();
    },
    [showResult, refreshPending]
  );

  const tick = useCallback(async () => {
    if (stoppedRef.current) return;
    if (processingRef.current) return;
    if (ambiguousRef.current) return;
    if (Date.now() < cooldownUntilRef.current) return;
    if (!videoRef.current) return;
    processingRef.current = true;
    try {
      const desc = await getSingleDescriptor(videoRef.current);
      if (!desc) return;
      const match = findBestMatch(desc, entriesRef.current);
      if (match) {
        if (match.ambiguous && match.candidates && match.candidates.length > 1) {
          updateAmbiguous(match.candidates.map((candidate) => candidate.entry));
          cooldownUntilRef.current = Date.now() + 15000;
          return;
        }
        await handleMatchedEntry(match.entry);
      } else {
        showResult({
          type: "unknown",
          message: "No te reconocí. Acércate o pide ayuda al docente.",
        });
      }
    } catch {
      // Ignoramos errores puntuales de detección.
    } finally {
      processingRef.current = false;
    }
  }, [handleMatchedEntry, showResult, updateAmbiguous]);

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 640 },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }
  }, []);

  const init = useCallback(async () => {
    stoppedRef.current = false;
    setPhase("loading");
    // El modelo empieza a cargar desde ya, en paralelo.
    const modelPromise = ensureModel();
    try {
      // Primero verificamos acceso (token/sesión): así, si falta la clave,
      // mostramos la pantalla de inmediato mientras el modelo sigue cargando.
      setStatusText("Verificando acceso...");
      const { entries, authError } = await loadDescriptors();
      if (authError && entries.length === 0) {
        setSetupError(
          getKioskToken()
            ? "La clave del kiosko no es válida. Verifícala e inténtalo de nuevo."
            : ""
        );
        setPhase("setup");
        return;
      }
      entriesRef.current = entries;

      // Recordamos quién ya ingresó hoy (sobrevive a recargas de la tablet).
      const todayRuts = await loadTodayRuts();
      markedTodayRef.current = new Set(todayRuts);
      setCount(todayRuts.length);

      // Esperamos a que el modelo termine de cargar (suele ya estar listo).
      setStatusText("Cargando modelos de reconocimiento...");
      await modelPromise;

      setStatusText("Encendiendo cámara...");
      await startCamera();
      await syncQueue();
      await refreshPending();
      setPhase("ready");
      setStatusText(`Listo · ${entries.length} estudiantes cargados`);
      loopRef.current = setInterval(tick, DETECT_INTERVAL_MS);
    } catch {
      setPhase("error");
      setStatusText("No se pudo iniciar. Revisa la cámara y los permisos.");
    }
  }, [ensureModel, startCamera, tick, refreshPending]);

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      const synced = await syncQueue();
      if (synced > 0) refreshPending();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const startTimer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      // Intentamos iniciar aunque no haya token: puede haber sesión admin activa.
      void init();
    }, 0);

    return () => {
      window.clearTimeout(startTimer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (loopRef.current) clearInterval(loopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveTokenAndRetry() {
    if (!tokenInput.trim()) {
      setSetupError("Escribe la clave del kiosko.");
      return;
    }
    setSetupError("");
    setKioskToken(tokenInput.trim());
    init();
  }

  const bgClass =
    result.type === "green"
      ? "bg-green-500"
      : result.type === "already"
      ? "bg-sky-500"
      : result.type === "red"
      ? "bg-red-500"
      : result.type === "unknown"
      ? "bg-amber-400"
      : "bg-playful";

  const resultEmoji =
    result.type === "green"
      ? "✅"
      : result.type === "already"
      ? "🔁"
      : result.type === "red"
      ? "🛑"
      : "🤔";

  // --- Pantalla de configuración del token de kiosko ---
  if (phase === "setup") {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="card p-8 w-full max-w-md animate-pop">
          <div className="text-center mb-5">
            <div className="text-6xl mb-2">📷</div>
            <h1 className="text-2xl font-black text-[#27407a]">
              Configurar tablet
            </h1>
            <p className="text-[#6b7aa0] font-semibold mt-1">
              Ingresa la clave del kiosko (la entrega el establecimiento)
            </p>
          </div>
          <input
            className="input-game mb-4"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Clave del kiosko"
          />
          {setupError && (
            <div className="mb-4 text-center font-bold text-[#ef4444]">
              {setupError}
            </div>
          )}
          <button
            onClick={saveTokenAndRetry}
            className="btn-game btn-blue w-full"
          >
            Guardar y comenzar
          </button>
          <div className="mt-3 text-center text-sm font-bold text-[#6b7aa0]">
            {modelReady
              ? "✅ Reconocimiento listo"
              : "⏳ Preparando reconocimiento en segundo plano..."}
          </div>
          <button
            onClick={goHome}
            className="block w-full text-center mt-5 font-bold text-[#6b7aa0]"
          >
            ← Volver
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`min-h-screen flex flex-col transition-colors duration-300 ${bgClass}`}
    >
      {/* Barra superior */}
      <header className="flex items-center justify-between px-4 py-3 text-white">
        <button
          onClick={goHome}
          className="font-black text-lg bg-white text-[#27407a] rounded-xl px-4 py-2 shadow-md"
        >
          ← Inicio
        </button>
        <div className="flex items-center gap-2 text-sm font-bold">
          <span
            className={`rounded-full px-3 py-1 shadow-sm ${
              online ? "bg-emerald-500" : "bg-rose-500"
            }`}
          >
            {online ? "🟢 En línea" : "🔴 Sin internet"}
          </span>
          {pending > 0 && (
            <span className="rounded-full px-3 py-1 shadow-sm bg-amber-500">
              ⏳ {pending} por sincronizar
            </span>
          )}
          <span className="rounded-full px-3 py-1 shadow-sm bg-[#5b86ff]">
            🍽️ {count} hoy
          </span>
        </div>
      </header>

      {/* Zona central */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        <div
          className="relative rounded-[2rem] overflow-hidden shadow-2xl border-8 border-white/40"
          style={{ width: "min(86vw, 460px)", aspectRatio: "1/1" }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100 bg-black"
          />

          {result.type && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center backdrop-blur-sm bg-black/25 text-white animate-pop p-4">
              <div className="text-8xl mb-2">{resultEmoji}</div>
              {result.nombre && (
                <div className="text-3xl font-black drop-shadow">
                  {result.nombre}
                </div>
              )}
              {result.curso && (
                <div className="text-xl font-bold opacity-90">
                  {result.curso}
                </div>
              )}
              <div className="text-2xl font-black mt-2 drop-shadow">
                {result.message}
              </div>
            </div>
          )}

          {ambiguous && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center backdrop-blur-sm bg-black/45 text-white animate-pop p-4">
              <div className="text-6xl mb-2">👀</div>
              <div className="text-2xl font-black drop-shadow mb-2">
                Necesito confirmar
              </div>
              <p className="font-bold mb-4">
                Hay estudiantes muy parecidos. Toca el nombre correcto.
              </p>
              <div className="grid gap-2 w-full max-w-sm">
                {ambiguous.map((entry) => (
                  <button
                    key={entry.rut}
                    onClick={() => {
                      updateAmbiguous(null);
                      handleMatchedEntry(entry);
                    }}
                    className="btn-game btn-blue !py-3 !text-lg"
                  >
                    {entry.nombre} · {entry.curso}
                  </button>
                ))}
                <button
                  onClick={() => {
                    updateAmbiguous(null);
                    cooldownUntilRef.current = Date.now() + 1000;
                  }}
                  className="btn-game btn-gray !py-3 !text-lg"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-white font-bold text-center drop-shadow min-h-[1.5rem]">
          {phase === "ready"
            ? result.type
              ? ""
              : "Mira a la cámara 😊"
            : statusText}
        </p>

        {phase === "error" && (
          <button onClick={init} className="btn-game btn-blue mt-4">
            Reintentar
          </button>
        )}

        <button
          onClick={() => setShowManual(true)}
          className="btn-game btn-orange mt-5"
        >
          ✍️ Ingreso manual (docente)
        </button>
      </div>

      {showManual && (
        <ManualModal
          onClose={() => setShowManual(false)}
          alreadyMarked={(rut) => markedTodayRef.current.has(rut)}
          onMarked={(rut) => {
            markedTodayRef.current.add(rut);
            setCount((c) => c + 1);
            refreshPending();
          }}
        />
      )}
    </main>
  );
}

// --- Modal de ingreso manual para el docente ---
// Busca por nombre/apellido y el docente elige el estudiante de la lista.
function ManualModal({
  onClose,
  onMarked,
  alreadyMarked,
}: {
  onClose: () => void;
  onMarked: (rut: string) => void;
  alreadyMarked: (rut: string) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  function updateQuery(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearching(false);
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      return;
    }
    const t = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchStudents(q);
      setResults(found);
      setSearching(false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  async function pick(s: StudentSearchResult) {
    setMsg(null);
    const nombreCompleto = fullName(s.nombre, s.apellidos);
    if (!s.perteneceAlmuerzo) {
      setMsg({
        type: "err",
        text: `${nombreCompleto} no pertenece al almuerzo. Derivar a Orientación.`,
      });
      return;
    }
    // Ya registrado hoy (en este dispositivo): avisamos sin volver a contar.
    if (alreadyMarked(s.rut)) {
      setMsg({ type: "err", text: `🔁 ${nombreCompleto} ya ingresó hoy.` });
      return;
    }
    setMarking(s.rut);
    try {
      const res = await markAttendance({
        rut: s.rut,
        nombre: nombreCompleto,
        curso: s.curso || "",
        method: "manual",
      });
      // El servidor también detecta duplicados del día (no sumamos doble).
      if (res.duplicate) {
        setMsg({ type: "err", text: `🔁 ${nombreCompleto} ya ingresó hoy.` });
        return;
      }
      if (res.ok) {
        onMarked(s.rut);
        setMsg({
          type: "ok",
          text: `✅ ${nombreCompleto} registrado${
            res.offline ? " (offline, se sincronizará)" : ""
          }`,
        });
        setQuery("");
        setResults([]);
      }
    } catch {
      setMsg({ type: "err", text: "Error. Inténtalo de nuevo." });
    } finally {
      setMarking(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="card p-7 w-full max-w-md animate-pop">
        <div className="text-center mb-4">
          <div className="text-5xl mb-1">✍️</div>
          <h2 className="text-2xl font-black text-[#27407a]">Ingreso manual</h2>
          <p className="text-[#6b7aa0] font-semibold">
            Busca por nombre y elige al estudiante
          </p>
        </div>

        <label className="label-game">Nombre o apellido</label>
        <input
          className="input-game mb-3"
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Ej: Juan Pérez"
          autoFocus
        />

        {msg && (
          <div
            className={`mb-3 text-center font-bold ${
              msg.type === "ok" ? "text-green-600" : "text-red-500"
            }`}
          >
            {msg.text}
          </div>
        )}

        <div className="max-h-[45vh] overflow-y-auto -mx-1 px-1">
          {searching && (
            <div className="text-center text-[#6b7aa0] font-bold py-4">
              Buscando...
            </div>
          )}

          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="text-center text-[#6b7aa0] font-semibold py-4">
              Sin resultados para “{query.trim()}”.
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            {results.map((s) => {
              const yaIngreso = alreadyMarked(s.rut);
              return (
              <button
                key={s.rut}
                onClick={() => pick(s)}
                disabled={marking !== null}
                className={`text-left rounded-2xl p-3 border-2 transition flex items-center justify-between gap-2 disabled:opacity-60 ${
                  yaIngreso
                    ? "bg-[#eef6ff] border-[#bfe0ff]"
                    : s.perteneceAlmuerzo
                    ? "bg-[#f4f8ff] border-[#eef2ff] hover:border-[#4f7cff]"
                    : "bg-[#fff5f5] border-[#ffd7d7]"
                }`}
              >
                <div className="min-w-0">
                  <div className="font-black text-[#27407a] truncate">
                    {fullName(s.nombre, s.apellidos) || "Sin nombre"}
                  </div>
                  <div className="text-sm text-[#6b7aa0] font-semibold truncate">
                    {[s.curso, formatRut(s.rut)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-black">
                  {marking === s.rut
                    ? "…"
                    : yaIngreso
                    ? "🔁 Ya ingresó"
                    : s.perteneceAlmuerzo
                    ? "Ingresar →"
                    : "🛑"}
                </span>
              </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn-game btn-gray w-full mt-4"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
