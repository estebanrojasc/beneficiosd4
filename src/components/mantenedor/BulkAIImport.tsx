"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CursoSelect from "@/components/CursoSelect";
import RutInput from "@/components/RutInput";
import { isValidRut, normalizeRut, formatRut } from "@/lib/rut";
import {
  fullName,
  CICLO_OPTIONS,
  getCicloConfig,
  buildCursoName,
} from "@/lib/curso";
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

function resizeImageIfNeeded(file: File, maxDimension = 2000): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return resolve(file);
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const needsResize = img.width > maxDimension || img.height > maxDimension;
        if (!needsResize && file.size <= 1.5 * 1024 * 1024) {
          // Si ya es pequeña en dimensiones y peso, la dejamos tal cual
          return resolve(file);
        }

        const scale = needsResize
          ? Math.min(maxDimension / img.width, maxDimension / img.height)
          : 1;
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(file);
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Guardamos como JPEG (comprime muy bien para texto escaneado/fotografiado)
        // o PNG si originalmente era PNG
        const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return resolve(file);
            }
            const resizedFile = new File([blob], file.name, {
              type: outputMime,
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          },
          outputMime,
          0.85 // Calidad alta del 85% para mantener las letras nítidas
        );
      };
      img.onerror = () => reject(new Error("No se pudo cargar la imagen para procesarla."));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo."));
    reader.readAsDataURL(file);
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

// Intenta separar un nombre libre de curso ("1°A Básico", "Kínder B",
// "3° Básico A") en ciclo / nivel / letra para prellenar el formulario de
// creación. Es best-effort: el usuario revisa antes de crear.
function parseCursoName(raw: string): {
  ciclo: string;
  nivel: number;
  letra: string;
} {
  const name = (raw || "").trim();
  const lower = name.toLowerCase();
  let ciclo = "";
  if (/prek/.test(lower)) ciclo = "Prekínder";
  else if (/k[ií]nder|kinde/.test(lower)) ciclo = "Kínder";
  else if (/b[aá]sic/.test(lower)) ciclo = "Básico";
  else if (/medio/.test(lower)) ciclo = "Medio";

  const numMatch = name.match(/\d+/);
  const nivel = numMatch ? parseInt(numMatch[0], 10) : 0;

  // Quitamos las palabras de ciclo, números y símbolos; lo que quede suele ser
  // la letra del curso.
  const rest = name
    .replace(/prek[ií]nder/gi, "")
    .replace(/k[ií]nder/gi, "")
    .replace(/b[aá]sico/gi, "")
    .replace(/medio/gi, "")
    .replace(/\d+/g, "")
    .replace(/°/g, "")
    .trim();
  const lm = rest.match(/[A-Za-zñÑ]/);
  const letra = lm ? lm[0].toUpperCase() : "";

  return { ciclo, nivel, letra };
}

type Phase =
  | "loading"
  | "form"
  | "processing"
  | "error"
  | "review"
  | "done";

export default function BulkAIImport({
  mode = "programa",
  source = "archivo",
  programId = "",
  onClose,
  onDone,
}: {
  mode?: "programa" | "estudiantes";
  source?: "archivo" | "texto";
  programId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const esEst = mode === "estudiantes";
  const esTexto = source === "texto";
  const needsCurso = esEst;
  const titulo = esTexto ? "Importar lista pegada" : "Carga masiva con IA";
  const [phase, setPhase] = useState<Phase>("loading");
  const [job, setJob] = useState<ImportJob | null>(null);

  // Subida
  const [file, setFile] = useState<File | null>(null);
  const [pasted, setPasted] = useState("");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");

  // Revisión
  const [students, setStudents] = useState<ImportStudent[]>([]);
  const [tab, setTab] = useState<
    "nuevos" | "existentes" | "rut" | "cursos"
  >("nuevos");
  const [cursoSet, setCursoSet] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [saving, setSaving] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<ImportJob["summary"] | null>(null);
  const [msg, setMsg] = useState("");

  // Cursos existentes en el sistema (para validar los cursos del archivo).
  const reloadCursos = useCallback(async () => {
    try {
      const r = await fetch("/api/cursos", { cache: "no-store" });
      const data = r.ok ? await r.json() : [];
      setCursoSet(
        new Set(
          (Array.isArray(data) ? data : []).map((c) => String(c.nombre))
        )
      );
    } catch {
      /* sin conexión: la validación de cursos queda en blanco */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      reloadCursos();
    }, 0);
    return () => window.clearTimeout(t);
  }, [reloadCursos]);

  useEffect(() => {
    let on = true;
    const t = window.setTimeout(async () => {
      try {
        const qs = esEst
          ? "scope=estudiantes"
          : `programId=${encodeURIComponent(programId)}`;
        const res = await fetch(`/api/imports?${qs}`, { cache: "no-store" });
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
  }, [programId, esEst]);

  async function process() {
    if (esTexto && !pasted.trim()) {
      setError("Pega al menos una línea.");
      return;
    }
    if (!esTexto && !file) {
      setError("Selecciona un archivo.");
      return;
    }
    setError("");
    setPhase("processing");
    try {
      const dataBase64 = esTexto ? undefined : await fileToBase64(file as File);
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: esEst ? "estudiantes" : undefined,
          programId: esEst ? undefined : programId,
          pasted: esTexto ? pasted : undefined,
          fileName: esTexto ? undefined : (file as File).name,
          fileType: esTexto ? undefined : (file as File).type,
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
      const txt = esTexto
        ? pasted.trim()
          ? "¿Cerrar sin importar la lista pegada?"
          : "¿Cerrar?"
        : file
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
  // RUT con problemas: inválido (formato/dígito verificador) o repetido.
  const rutProblemas = nuevos.filter(
    ({ s }) => !s.rutValido || s.dupEnArchivo
  );

  // ¿El curso (no vacío) existe en el sistema? Si no, va a "Cursos faltantes".
  const cursoFalta = useCallback(
    (curso: string) => {
      const c = curso.trim();
      return Boolean(c) && cursoSet.size > 0 && !cursoSet.has(c);
    },
    [cursoSet]
  );

  // Cursos del archivo (de los nuevos) que no existen en el sistema, con cuántos
  // estudiantes tiene cada uno.
  const missingCursos = useMemo(() => {
    const map = new Map<string, number>();
    for (const { s } of nuevos) {
      if (cursoFalta(s.curso)) {
        const c = s.curso.trim();
        map.set(c, (map.get(c) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "es", { numeric: true })
    );
  }, [nuevos, cursoFalta]);

  // Al crear un curso, renombramos a los estudiantes de ese curso al nombre
  // canónico del sistema para que se vinculen correctamente al cargar.
  function onCursoCreated(original: string, canonical: string) {
    if (original !== canonical) {
      setStudents((prev) =>
        prev.map((s) =>
          s.curso.trim() === original ? { ...s, curso: canonical } : s
        )
      );
    }
    reloadCursos();
  }

  function update(index: number, patch: Partial<ImportStudent>) {
    setStudents((prev) => {
      const next = prev.map((s, i) => (i === index ? { ...s, ...patch } : s));
      if (!("rut" in patch)) return next;
      // Al corregir el RUT y quedar válido (y sin duplicar/existir), lo dejamos
      // seleccionado para cargar.
      const rec = recompute(next);
      return rec.map((s, i) =>
        i === index && s.rutValido && !s.dupEnArchivo && !s.yaExiste
          ? { ...s, incluir: true }
          : s
      );
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
      setMsg("No hay estudiantes seleccionados.");
      return;
    }
    if (missingCursos.length > 0) {
      setTab("cursos");
      setVisible(PAGE_SIZE);
      setMsg("Antes de cargar, crea o corrige los cursos faltantes.");
      return;
    }
    if (
      !confirm(
        esEst
          ? `¿Cargar ${aCargar} estudiante(s) del establecimiento?`
          : `¿Agregar ${aCargar} estudiante(s) a la lista?`
      )
    )
      return;
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

  const list =
    tab === "nuevos"
      ? nuevos
      : tab === "existentes"
      ? existentes
      : tab === "rut"
      ? rutProblemas
      : [];
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
          <h2 className="text-2xl font-black text-[#27407a]">{titulo}</h2>
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
            {esTexto ? (
              <>
                <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
                  Pega la lista (una línea por estudiante) y revísala antes de{" "}
                  {esEst
                    ? "crear los estudiantes."
                    : "agregarlos a esta lista."}
                </p>
                <label className="label-game">Lista (texto)</label>
                <p className="text-sm text-[#6b7aa0] font-semibold mb-2">
                  Una línea por estudiante:{" "}
                  <code>RUT;Nombre;Apellidos;Nivel;Ciclo;Letra</code> (también
                  vale solo el RUT).
                </p>
                <textarea
                  className="input-game mb-4 min-h-[160px] font-mono text-sm"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={"12.345.678-9;Juan;Pérez;3;Básico;A\n11.222.333-4"}
                />
              </>
            ) : (
              <>
                <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
                  Sube una lista (PDF, imagen, Excel, Word o texto) y la IA extrae
                  los estudiantes para revisarlos y{" "}
                  {esEst
                    ? "cargarlos como estudiantes del establecimiento."
                    : "agregarlos a la lista de este programa."}
                </p>
                <label className="label-game">Archivo</label>
                <label className="block rounded-2xl border-2 border-dashed border-[#cdd9f5] bg-[#f6f8ff] p-5 text-center cursor-pointer mb-4">
                  <input
                    type="file"
                    accept={ACCEPT}
                    className="hidden"
                    onChange={async (e) => {
                      let f = e.target.files?.[0] || null;
                      e.target.value = "";
                      if (!f) return;

                      setError("");

                      if (f.type.startsWith("image/")) {
                        const MAX_RAW_IMAGE_SIZE = 15 * 1024 * 1024; // Permitimos hasta 15MB ya que la comprimiremos
                        if (f.size > MAX_RAW_IMAGE_SIZE) {
                          setFile(null);
                          setError("La imagen original es demasiado grande (máx. 15 MB).");
                          return;
                        }
                        setError("Comprimiendo imagen...");
                        try {
                          f = await resizeImageIfNeeded(f);
                          setError("");
                        } catch (err) {
                          setFile(null);
                          setError(err instanceof Error ? err.message : "Error al procesar la imagen.");
                          return;
                        }
                      } else {
                        if (f.size > MAX_FILE_BYTES) {
                          setFile(null);
                          setError(
                            "El archivo es muy grande (máx. 3,5 MB). Comprímelo o divídelo."
                          );
                          return;
                        }
                      }

                      setFile(f);
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
              </>
            )}

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
                disabled={esTexto ? !pasted.trim() : !file}
                className="btn-game btn-blue flex-1"
              >
                {phase === "error"
                  ? "Reintentar"
                  : esTexto
                  ? "Revisar lista"
                  : "Procesar con IA"}
              </button>
            </div>
          </>
        )}

        {phase === "processing" && <Stepper texto={esTexto} />}

        {phase === "done" && summary && (
          <div className="text-center space-y-3 py-4">
            <div className="text-5xl">✅</div>
            <h3 className="text-xl font-black text-[#27407a]">
              {esEst ? "Listo, estudiantes cargados" : "Listo, agregados a la lista"}
            </h3>
            <div className="text-[#41507a] font-bold">
              {summary.created} {esEst ? "creados" : "agregados"} ·{" "}
              {summary.skipped} omitidos
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
                {aCargar} {esEst ? "a cargar" : "a agregar"}
              </span>
            </div>

            <div className="flex gap-2 mb-3 flex-wrap">
              {[
                { k: "nuevos" as const, label: `Nuevos (${nuevos.length})` },
                {
                  k: "existentes" as const,
                  label: esEst
                    ? `Ya existen (${existentes.length})`
                    : `Ya en la lista (${existentes.length})`,
                },
                ...(rutProblemas.length > 0
                  ? [
                      {
                        k: "rut" as const,
                        label: `RUT a revisar (${rutProblemas.length})`,
                      },
                    ]
                  : []),
                ...(missingCursos.length > 0
                  ? [
                      {
                        k: "cursos" as const,
                        label: `Cursos faltantes (${missingCursos.length})`,
                      },
                    ]
                  : []),
              ].map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => {
                    setTab(k);
                    setVisible(PAGE_SIZE);
                  }}
                  className={`rounded-2xl px-4 py-2 font-extrabold transition ${
                    tab === k
                      ? k === "cursos"
                        ? "bg-[#e8852c] text-white shadow"
                        : k === "rut"
                        ? "bg-[#d6453f] text-white shadow"
                        : "bg-[#4f7cff] text-white shadow"
                      : "bg-white text-[#41507a] border-2 border-[#eef2ff]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "cursos" ? (
              <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-3">
                <p className="text-sm text-[#6b7aa0] font-semibold">
                  Estos cursos del archivo no existen en el sistema. Créalos para
                  que los estudiantes queden bien vinculados a su curso. Revisa los
                  datos antes de crear.
                </p>
                {missingCursos.map(([curso, count]) => (
                  <MissingCursoRow
                    key={curso}
                    curso={curso}
                    count={count}
                    onCreated={onCursoCreated}
                  />
                ))}
              </div>
            ) : (
              <>
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
                    : tab === "rut"
                    ? "No hay RUT con problemas. 🎉"
                    : esEst
                    ? "Ningún estudiante del archivo existe aún."
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
                            needsCurso={needsCurso}
                            cursoMissing={cursoFalta(s.curso)}
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
              </>
            )}

            {msg && (
              <div className="text-center font-bold text-[#41507a] mt-3">
                {msg}
              </div>
            )}

            {missingCursos.length > 0 && (
              <div className="mt-3 rounded-2xl border-2 border-[#ffe2bd] bg-[#fff9f1] p-3 text-sm font-bold text-[#b9651b]">
                Hay {missingCursos.length} curso
                {missingCursos.length === 1 ? "" : "s"} faltante
                {missingCursos.length === 1 ? "" : "s"}. Crea{" "}
                {missingCursos.length === 1 ? "ese curso" : "esos cursos"} o
                corrige el curso antes de cargar, para que los estudiantes queden
                bien vinculados.
                <button
                  onClick={() => {
                    setTab("cursos");
                    setVisible(PAGE_SIZE);
                  }}
                  className="ml-2 font-black text-[#e8852c] underline"
                >
                  Revisar cursos faltantes
                </button>
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
                disabled={committing || aCargar === 0 || missingCursos.length > 0}
                className="btn-game btn-blue flex-1"
                title={
                  missingCursos.length > 0
                    ? "Primero crea o corrige los cursos faltantes"
                    : undefined
                }
              >
                {committing
                  ? esEst
                    ? "Cargando..."
                    : "Agregando..."
                  : esEst
                  ? `✅ Cargar ${aCargar}`
                  : `✅ Agregar ${aCargar}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stepper({ texto = false }: { texto?: boolean }) {
  const steps = texto
    ? ["Leyendo la lista", "Validando RUT y cursos"]
    : ["Leyendo el archivo", "Enviando a la IA", "Estructurando estudiantes"];
  return (
    <div className="py-8 text-center">
      <div className="text-5xl mb-4 animate-bounce">{texto ? "📋" : "🤖"}</div>
      <div className="font-black text-[#27407a] mb-4">
        {texto ? "Procesando lista..." : "Procesando con IA..."}
      </div>
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
  needsCurso = false,
  cursoMissing = false,
  onChange,
}: {
  s: ImportStudent;
  tab: "nuevos" | "existentes" | "rut" | "cursos";
  needsCurso?: boolean;
  cursoMissing?: boolean;
  onChange: (patch: Partial<ImportStudent>) => void;
}) {
  const existing = tab === "existentes";
  const faltaCurso = needsCurso && !s.curso.trim();
  const tieneProblema = !s.rutValido || s.dupEnArchivo || faltaCurso;
  return (
    <div
      className={`rounded-2xl border-2 p-3 ${
        existing
          ? "bg-[#f6f7fb] border-[#e3e7f2]"
          : tieneProblema
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
          {tieneProblema && (
            <div className="text-xs font-bold text-[#c0392b]">
              {!s.rutValido
                ? "⚠️ RUT inválido o vacío: corrígelo para poder agregarlo."
                : s.dupEnArchivo
                ? "⚠️ RUT repetido en el archivo."
                : "⚠️ Falta el curso: es obligatorio para crear el estudiante."}
            </div>
          )}
          {!tieneProblema && cursoMissing && (
            <div className="text-xs font-bold text-[#b9651b]">
              ⚠️ El curso “{s.curso.trim()}” no existe en el sistema. Créalo en la
              pestaña “Cursos faltantes”.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Fila para crear un curso que falta en el sistema, prellenada a partir del
// nombre del archivo. Al crearlo, renombra a los estudiantes a su nombre
// canónico para que se vinculen al cargar.
function MissingCursoRow({
  curso,
  count,
  onCreated,
}: {
  curso: string;
  count: number;
  onCreated: (original: string, canonical: string) => void;
}) {
  const guess = parseCursoName(curso);
  const [ciclo, setCiclo] = useState(guess.ciclo);
  const [nivel, setNivel] = useState(guess.nivel ? String(guess.nivel) : "");
  const [letra, setLetra] = useState(guess.letra);
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const conf = getCicloConfig(ciclo);
  const usaNivel = conf?.usaNivel ?? true;

  async function crear() {
    setErr("");
    if (!conf) {
      setErr("Selecciona un ciclo.");
      return;
    }
    if (usaNivel && !nivel) {
      setErr("Indica el nivel.");
      return;
    }
    if (!letra.trim()) {
      setErr("Indica la letra.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        ciclo,
        nivel: usaNivel ? Number(nivel) : 0,
        letra: letra.trim().toUpperCase(),
        anio: Number(anio) || new Date().getFullYear(),
      };
      const res = await fetch("/api/cursos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok || res.status === 409) {
        // Si ya existía (409), igual lo damos por bueno para vincular.
        const canonical = buildCursoName(
          body.nivel,
          body.ciclo,
          body.letra
        );
        setDone(true);
        onCreated(curso, canonical);
      } else {
        setErr(d.error || "No se pudo crear el curso.");
      }
    } catch {
      setErr("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-[#cdeccf] bg-[#f1faf2] p-3 text-sm font-bold text-[#1c7a44]">
        ✅ Curso creado para “{curso}”. Estudiantes vinculados.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[#ffe2bd] bg-[#fff9f1] p-3 space-y-2">
      <div className="font-bold text-[#27407a]">
        {curso}{" "}
        <span className="text-xs font-bold text-[#9aa6bf]">
          ({count} estudiante{count === 1 ? "" : "s"})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input-game !py-1.5 !w-auto"
          value={ciclo}
          onChange={(e) => setCiclo(e.target.value)}
        >
          <option value="">Ciclo...</option>
          {CICLO_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {usaNivel && (
          <input
            className="input-game !py-1.5 w-20"
            value={nivel}
            onChange={(e) => setNivel(e.target.value.replace(/\D/g, ""))}
            placeholder="Nivel"
            inputMode="numeric"
          />
        )}
        <input
          className="input-game !py-1.5 w-16 uppercase"
          value={letra}
          onChange={(e) => setLetra(e.target.value.slice(0, 1).toUpperCase())}
          placeholder="Letra"
        />
        <input
          className="input-game !py-1.5 w-24"
          value={anio}
          onChange={(e) => setAnio(e.target.value.replace(/\D/g, ""))}
          placeholder="Año"
          inputMode="numeric"
        />
        <button
          onClick={crear}
          disabled={busy}
          className="btn-game btn-green !py-1.5 !px-4"
        >
          {busy ? "Creando..." : "Crear curso"}
        </button>
      </div>
      {err && <div className="text-xs font-bold text-[#c0392b]">{err}</div>}
    </div>
  );
}
