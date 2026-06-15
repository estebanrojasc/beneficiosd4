"use client";

import { useEffect, useState } from "react";
import CursoSelect from "@/components/CursoSelect";
import RutInput from "@/components/RutInput";
import { isValidRut, normalizeRut, formatRut } from "@/lib/rut";
import { fullName } from "@/lib/curso";
import type { ImportJob, ImportStudent } from "@/lib/types";

const ACCEPT = ".pdf,image/*,.xlsx,.csv,.docx,.txt";
const PAGE_SIZE = 50;
// Límite del archivo: el cuerpo va en base64 (+~33%) y las funciones tienen
// un máximo de ~4.5 MB de request en producción.
const MAX_FILE_BYTES = 3.5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read"));
    r.onload = () => {
      const s = String(r.result);
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

// Recalcula validaciones locales (RUT válido y duplicado dentro del archivo).
function recompute(students: ImportStudent[]): ImportStudent[] {
  const counts = new Map<string, number>();
  for (const s of students) {
    const n = normalizeRut(s.rut);
    if (n && isValidRut(n)) counts.set(n, (counts.get(n) || 0) + 1);
  }
  const seen = new Set<string>();
  return students.map((s) => {
    const n = normalizeRut(s.rut);
    const rutValido = Boolean(n) && isValidRut(n);
    const dupEnArchivo = rutValido && (counts.get(n) || 0) > 1 && seen.has(n);
    if (rutValido) seen.add(n);
    return { ...s, rutValido, dupEnArchivo };
  });
}

type Phase =
  | "loading"
  | "form"
  | "processing"
  | "error"
  | "review"
  | "done";

export default function BulkAIImport({
  programId,
  onClose,
  onDone,
}: {
  programId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [job, setJob] = useState<ImportJob | null>(null);

  // Subida
  const [file, setFile] = useState<File | null>(null);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");

  // Revisión
  const [students, setStudents] = useState<ImportStudent[]>([]);
  const [tab, setTab] = useState<"nuevos" | "existentes">("nuevos");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<ImportJob["summary"] | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let on = true;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/imports?programId=${encodeURIComponent(programId)}`,
          { cache: "no-store" }
        );
        const d = res.ok ? await res.json() : { job: null };
        if (!on) return;
        if (d.job) {
          setJob(d.job);
          setStudents(d.job.students || []);
          setPhase("review");
        } else {
          setPhase("form");
        }
      } catch {
        if (on) setPhase("form");
      }
    }, 0);
    return () => {
      on = false;
      window.clearTimeout(t);
    };
  }, [programId]);

  async function process() {
    if (!file) {
      setError("Selecciona un archivo.");
      return;
    }
    setError("");
    setPhase("processing");
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId,
          fileName: file.name,
          fileType: file.type,
          dataBase64,
          comentario,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.message || d.error || "No se pudo procesar el archivo.");
        if (res.status === 409 && d.job) {
          setJob(d.job);
          setStudents(d.job.students || []);
          setPhase("review");
        } else {
          setPhase("error");
        }
        return;
      }
      setJob(d.job);
      setStudents(d.job.students || []);
      setPhase("review");
    } catch {
      setError("Error de conexión al procesar el archivo.");
      setPhase("error");
    }
  }

  function tryClose() {
    if (phase === "processing") {
      alert("Espera a que termine el procesamiento.");
      return;
    }
    if (phase === "done" || phase === "loading") {
      onClose();
      return;
    }
    if (phase === "review") {
      if (
        !confirm(
          "El proceso quedará guardado y podrás continuarlo después. ¿Cerrar la carga masiva?"
        )
      )
        return;
    } else {
      // form / error
      const txt = file
        ? "¿Cerrar sin procesar el archivo?"
        : "¿Cerrar la carga masiva?";
      if (!confirm(txt)) return;
    }
    onClose();
  }

  const indexedAll = students.map((s, i) => ({ s, i }));
  const nuevos = indexedAll.filter(({ s }) => !s.yaExiste);
  const existentes = indexedAll.filter(({ s }) => s.yaExiste);
  const aCargar = nuevos.filter(({ s }) => s.incluir).length;
  const conProblemas = nuevos.filter(
    ({ s }) => !s.rutValido || s.dupEnArchivo
  ).length;

  function update(index: number, patch: Partial<ImportStudent>) {
    setStudents((prev) => {
      const next = prev.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return "rut" in patch ? recompute(next) : next;
    });
  }

  // Marca/desmarca todos los nuevos válidos (útil con listas largas).
  function setAllIncluir(val: boolean) {
    setStudents((prev) =>
      prev.map((s) =>
        !s.yaExiste && s.rutValido && !s.dupEnArchivo
          ? { ...s, incluir: val }
          : s
      )
    );
  }

  async function saveProgress() {
    if (!job) return;
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/imports/${job._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students }),
      });
      setMsg(res.ok ? "Avance guardado." : "No se pudo guardar el avance.");
    } finally {
      setSaving(false);
    }
  }

  async function commit() {
    if (!job) return;
    if (aCargar === 0) {
      setMsg("No hay estudiantes seleccionados para agregar.");
      return;
    }
    if (!confirm(`¿Agregar ${aCargar} estudiante(s) a la lista?`)) return;
    setCommitting(true);
    setMsg("");
    try {
      const res = await fetch(`/api/imports/${job._id}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ students }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSummary(d.summary);
        setPhase("done");
      } else setMsg(d.error || "No se pudo agregar.");
    } finally {
      setCommitting(false);
    }
  }

  async function cancel() {
    if (!job) {
      onClose();
      return;
    }
    if (!confirm("¿Cerrar este proceso sin agregar? Quedará en el historial."))
      return;
    await fetch(`/api/imports/${job._id}/cancel`, { method: "POST" });
    onClose();
  }

  const list = tab === "nuevos" ? nuevos : existentes;
  const shown = list.slice(0, visible);
  const groups: Record<string, { s: ImportStudent; i: number }[]> = {};
  for (const it of shown) {
    const key = it.s.curso || "Sin curso";
    (groups[key] ||= []).push(it);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto"
      onClick={tryClose}
    >
      <div
        className="card p-6 w-full max-w-2xl my-auto animate-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-black text-[#27407a]">
            Carga masiva con IA
          </h2>
          <button
            onClick={tryClose}
            className="text-2xl font-black text-[#9aa6bf]"
          >
            ✕
          </button>
        </div>

        {phase === "loading" && (
          <div className="text-[#6b7aa0] font-bold py-8 text-center">
            Cargando...
          </div>
        )}

        {(phase === "form" || phase === "error") && (
          <>
            <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
              Sube una lista (PDF, imagen, Excel, Word o texto) y la IA extrae los
              estudiantes para revisarlos y agregarlos a la lista de este
              programa.
            </p>
            <label className="label-game">Archivo</label>
            <label className="block rounded-2xl border-2 border-dashed border-[#cdd9f5] bg-[#f6f8ff] p-5 text-center cursor-pointer mb-4">
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  e.target.value = "";
                  if (f && f.size > MAX_FILE_BYTES) {
                    setFile(null);
                    setError(
                      "El archivo es muy grande (máx. 3,5 MB). Comprímelo o divídelo."
                    );
                    return;
                  }
                  setFile(f);
                  setError("");
                }}
              />
              {file ? (
                <span className="font-bold text-[#27407a] break-all">
                  📄 {file.name}
                </span>
              ) : (
                <span className="font-bold text-[#6b7aa0]">
                  Toca para elegir PDF, imagen, Excel, Word o texto
                </span>
              )}
            </label>

            <label className="label-game">Comentario (orienta a la IA)</label>
            <textarea
              className="input-game mb-1 min-h-[80px]"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej: Es la lista del 4° Básico A. La primera columna es el RUT y la segunda el nombre completo."
            />
            <p className="text-[11px] text-[#9aa6bf] mb-4">
              Si falta el curso en el documento, descríbelo aquí. Máx. 20
              páginas/hojas por archivo.
            </p>

            {error && (
              <div className="mb-3 font-bold text-center text-[#ef4444]">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={tryClose} className="btn-game btn-gray flex-1">
                Cancelar
              </button>
              <button
                onClick={process}
                disabled={!file}
                className="btn-game btn-blue flex-1"
              >
                {phase === "error" ? "Reintentar" : "Procesar con IA"}
              </button>
            </div>
          </>
        )}

        {phase === "processing" && <Stepper />}

        {phase === "done" && summary && (
          <div className="text-center space-y-3 py-4">
            <div className="text-5xl">✅</div>
            <h3 className="text-xl font-black text-[#27407a]">
              Listo, agregados a la lista
            </h3>
            <div className="text-[#41507a] font-bold">
              {summary.created} agregados · {summary.skipped} omitidos
              {summary.errors ? ` · ${summary.errors} con error` : ""}
            </div>
            <button
              onClick={onDone}
              className="btn-game btn-blue w-full"
            >
              Listo
            </button>
          </div>
        )}

        {phase === "review" && (
          <>
            <div className="flex gap-2 flex-wrap text-sm font-bold mb-3">
              <span className="rounded-full bg-[#eafaf0] text-[#1c7a44] px-3 py-1">
                {aCargar} a agregar
              </span>
              <span className="rounded-full bg-[#eef2ff] text-[#41507a] px-3 py-1">
                {existentes.length} ya en la lista
              </span>
              {conProblemas > 0 && (
                <span className="rounded-full bg-[#fdeaea] text-[#c0392b] px-3 py-1">
                  {conProblemas} con problemas
                </span>
              )}
            </div>

            <div className="flex gap-2 mb-3">
              {(["nuevos", "existentes"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setVisible(PAGE_SIZE);
                  }}
                  className={`rounded-2xl px-4 py-2 font-extrabold transition ${
                    tab === t
                      ? "bg-[#4f7cff] text-white shadow"
                      : "bg-white text-[#41507a] border-2 border-[#eef2ff]"
                  }`}
                >
                  {t === "nuevos"
                    ? `Nuevos (${nuevos.length})`
                    : `Ya en la lista (${existentes.length})`}
                </button>
              ))}
            </div>

            <div className="flex items-center flex-wrap gap-2 mb-2">
              <span className="text-xs font-bold text-[#9aa6bf]">
                Mostrando {Math.min(shown.length, list.length)} de {list.length}
              </span>
              {tab === "nuevos" && nuevos.length > 0 && (
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={() => setAllIncluir(true)}
                    className="text-xs font-bold text-[#4f7cff]"
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-[#d4dcf0]">·</span>
                  <button
                    onClick={() => setAllIncluir(false)}
                    className="text-xs font-bold text-[#9aa6bf]"
                  >
                    Quitar todos
                  </button>
                </div>
              )}
            </div>

            <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-4">
              {list.length === 0 ? (
                <div className="card p-6 text-center text-[#6b7aa0] font-semibold">
                  {tab === "nuevos"
                    ? "No hay estudiantes nuevos."
                    : "Ningún estudiante de la lista está aún en el programa."}
                </div>
              ) : (
                <>
                  {Object.entries(groups).map(([curso, items]) => (
                    <div key={curso}>
                      <h3 className="font-black text-[#41507a] mb-2">
                        {curso}{" "}
                        <span className="text-xs font-bold text-[#9aa6bf]">
                          ({items.length})
                        </span>
                      </h3>
                      <div className="space-y-2">
                        {items.map(({ s, i }) => (
                          <RowEditor
                            key={i}
                            s={s}
                            tab={tab}
                            onChange={(patch) => update(i, patch)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  {list.length > visible && (
                    <div className="flex justify-center">
                      <button
                        onClick={() => setVisible((v) => v + PAGE_SIZE)}
                        className="btn-game btn-gray !px-6"
                      >
                        Ver más ({list.length - visible} restantes)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {msg && (
              <div className="text-center font-bold text-[#41507a] mt-3">
                {msg}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-3 mt-3 border-t-2 border-[#eef2ff]">
              <button
                onClick={cancel}
                className="btn-game btn-gray !px-3"
              >
                Cerrar proceso
              </button>
              <button
                onClick={saveProgress}
                disabled={saving}
                className="btn-game btn-gray flex-1"
              >
                {saving ? "Guardando..." : "💾 Guardar avance"}
              </button>
              <button
                onClick={commit}
                disabled={committing || aCargar === 0}
                className="btn-game btn-blue flex-1"
              >
                {committing ? "Agregando..." : `✅ Agregar ${aCargar}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stepper() {
  const steps = [
    "Leyendo el archivo",
    "Enviando a la IA",
    "Estructurando estudiantes",
  ];
  return (
    <div className="py-8 text-center">
      <div className="text-5xl mb-4 animate-bounce">🤖</div>
      <div className="font-black text-[#27407a] mb-4">Procesando con IA...</div>
      <div className="space-y-2 max-w-xs mx-auto text-left">
        {steps.map((s, i) => (
          <div
            key={s}
            className="flex items-center gap-2 font-bold text-[#41507a]"
          >
            <span
              className="w-3 h-3 rounded-full bg-[#4f7cff] animate-pulse"
              style={{ animationDelay: `${i * 200}ms` }}
            />
            {s}
          </div>
        ))}
      </div>
      <p className="text-xs text-[#9aa6bf] mt-4">
        Puede tardar unos segundos. No cierres esta ventana.
      </p>
    </div>
  );
}

function RowEditor({
  s,
  tab,
  onChange,
}: {
  s: ImportStudent;
  tab: "nuevos" | "existentes";
  onChange: (patch: Partial<ImportStudent>) => void;
}) {
  const existing = tab === "existentes";
  return (
    <div
      className={`rounded-2xl border-2 p-3 ${
        existing
          ? "bg-[#f6f7fb] border-[#e3e7f2]"
          : !s.rutValido || s.dupEnArchivo
          ? "bg-[#fff8f8] border-[#ffd7d7]"
          : "bg-white border-[#eef2ff]"
      }`}
    >
      {existing ? (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[#27407a] truncate">
              {fullName(s.nombre, s.apellidos) || "Sin nombre"}
            </div>
            <div className="text-xs text-[#9aa6bf] font-semibold">
              {formatRut(s.rut)} · {s.curso || "—"}
            </div>
          </div>
          <span
            className={`text-xs font-black px-2 py-1 rounded-lg shrink-0 ${
              s.enrolado
                ? "bg-[#eafaf0] text-[#1c7a44]"
                : "bg-[#eef2ff] text-[#41507a]"
            }`}
          >
            {s.enrolado ? "Enrolado" : "En la lista"}
          </span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={s.incluir}
              onChange={(e) => onChange({ incluir: e.target.checked })}
              className="w-5 h-5 accent-[#4f7cff] shrink-0"
              title="Incluir en la carga"
            />
            <input
              className="input-game !py-1.5 flex-1"
              value={s.nombre}
              onChange={(e) => onChange({ nombre: e.target.value })}
              placeholder="Nombres"
            />
            <input
              className="input-game !py-1.5 flex-1"
              value={s.apellidos}
              onChange={(e) => onChange({ apellidos: e.target.value })}
              placeholder="Apellidos"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <RutInput
                value={s.rut}
                onChange={(v) => onChange({ rut: v })}
                className={`input-game !py-1.5 ${
                  s.rutValido ? "" : "!border-[#ef4444]"
                }`}
              />
            </div>
            <div className="flex-1">
              <CursoSelect
                value={s.curso}
                onChange={(v) => onChange({ curso: v })}
                className="input-game !py-1.5"
                emptyLabel="Curso..."
              />
            </div>
          </div>
          {(!s.rutValido || s.dupEnArchivo) && (
            <div className="text-xs font-bold text-[#c0392b]">
              {!s.rutValido
                ? "⚠️ RUT inválido o vacío: corrígelo para poder agregarlo."
                : "⚠️ RUT repetido en el archivo."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
