"use client";

import { useCallback, useEffect, useState } from "react";
import FaceCapture from "@/components/FaceCapture";
import RutInput from "@/components/RutInput";
import CursoSelect from "@/components/CursoSelect";
import { splitNombreCompleto } from "@/lib/curso";
import type { Program, StudentConsent } from "@/lib/types";
import { PARENTESCOS, consentStatusLabel, calculateAge, getAutonomyTier, ESTUDIANTE_TITULAR_PARENTESCO } from "@/lib/consent";
import { isValidRut, normalizeRut } from "@/lib/rut";

export interface StudentLite {
  _id?: string;
  nombre: string;
  apellidos?: string;
  curso: string;
  anio?: number;
  rut: string;
  enrolled?: boolean;
  consent?: StudentConsent;
  fechaNacimiento?: string;
}

interface Props {
  initial?: Partial<StudentLite>;
  onClose: () => void;
  onSaved: () => void;
}

function getInitialForm(initial?: Partial<StudentLite>) {
  if (!initial) {
    return {
      nombre: "",
      apellidos: "",
      curso: "",
      rut: "",
      fechaNacimiento: "",
    };
  }

  let nombre = initial.nombre || "";
  let apellidos = initial.apellidos || "";

  if (initial.apellidos === undefined && initial.nombre?.includes(" ")) {
    const split = splitNombreCompleto(initial.nombre);
    nombre = split.nombre;
    apellidos = split.apellidos;
  }

  return {
    nombre,
    apellidos,
    curso: initial.curso || "",
    rut: initial.rut || "",
    fechaNacimiento: initial.fechaNacimiento || "",
  };
}

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export default function StudentModal({ initial, onClose, onSaved }: Props) {
  const isEdit = Boolean(initial?._id);
  const initialForm = getInitialForm(initial);
  const [nombre, setNombre] = useState(initialForm.nombre);
  const [apellidos, setApellidos] = useState(initialForm.apellidos);
  const [curso, setCurso] = useState(initialForm.curso);
  const [rut, setRut] = useState(initialForm.rut);
  const [fechaNacimiento, setFechaNacimiento] = useState(initialForm.fechaNacimiento);
  const [autoFirma, setAutoFirma] = useState(false);
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const age = fechaNacimiento ? calculateAge(fechaNacimiento) : 0;
  const autonomyTier = fechaNacimiento ? getAutonomyTier(age) : "tutela";

  // --- Consentimiento del apoderado (Ley 21.719) ---
  const [consent, setConsent] = useState<StudentConsent | undefined>(
    initial?.consent
  );
  const [showConsentForm, setShowConsentForm] = useState(false);
  const [apoderadoNombre, setApoderadoNombre] = useState("");
  const [apoderadoRut, setApoderadoRut] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [firmadoAt, setFirmadoAt] = useState(todayISO());
  const [notas, setNotas] = useState("");
  const [confirmoFisico, setConfirmoFisico] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentMsg, setConsentMsg] = useState("");

  const consentGranted = consent?.status === "otorgado";
  // SOLO PRUEBAS: permite capturar sin autorización si está activado el bypass.
  const bypassConsent = process.env.NEXT_PUBLIC_BYPASS_CONSENT === "true";
  const captureUnlocked = consentGranted || bypassConsent;

  const [revocationAuditId, setRevocationAuditId] = useState<string | null>(null);

  const fetchRevocationLog = useCallback(async () => {
    const r = (initial?.rut || "").trim();
    if (!r) return;
    try {
      const res = await fetch(`/api/audit?rut=${encodeURIComponent(r)}&action=consent.revoke&limit=1`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.items && data.items.length > 0) {
          setRevocationAuditId(data.items[0]._id);
        }
      }
    } catch {}
  }, [initial?.rut]);

  useEffect(() => {
    if (consent?.status === "revocado") {
      void fetchRevocationLog();
    }
  }, [consent?.status, fetchRevocationLog]);

  // Programas (con lista) a los que pertenece el estudiante.
  const [programs, setPrograms] = useState<Program[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [initialMemberOf, setInitialMemberOf] = useState<Set<string>>(new Set());

  const loadPrograms = useCallback(async () => {
    try {
      const res = await fetch("/api/programs", { cache: "no-store" });
      const all: Program[] = res.ok ? await res.json() : [];
      setPrograms(all.filter((p) => p.requiereMembresia));
    } catch {
      setPrograms([]);
    }
    const r = (initial?.rut || "").trim();
    if (r) {
      try {
        const res = await fetch(
          `/api/students/memberships?rut=${encodeURIComponent(r)}`,
          { cache: "no-store" }
        );
        const data = res.ok ? await res.json() : { programIds: [] };
        const set = new Set<string>(data.programIds || []);
        setMemberOf(set);
        setInitialMemberOf(new Set(set));
      } catch {
        /* sin membresías */
      }
    }
  }, [initial?.rut]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadPrograms(), 0);
    return () => window.clearTimeout(t);
  }, [loadPrograms]);

  function toggleProgram(id: string) {
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Aplica las altas/bajas de membresía según lo seleccionado.
  async function syncMemberships() {
    const r = normalizeRut(rut);
    if (!r) return;
    const toAdd = [...memberOf].filter((id) => !initialMemberOf.has(id));
    const toRemove = [...initialMemberOf].filter((id) => !memberOf.has(id));
    await Promise.all([
      ...toAdd.map((id) =>
        fetch(`/api/programs/${id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rut: r, nombre, apellidos, curso }),
        }).catch(() => {})
      ),
      ...toRemove.map((id) =>
        fetch(
          `/api/programs/${id}/members?rut=${encodeURIComponent(r)}`,
          { method: "DELETE" }
        ).catch(() => {})
      ),
    ]);
  }

  // Datos del formulario de autorización, ya validados.
  function consentInput() {
    return {
      apoderadoNombre: apoderadoNombre.trim(),
      apoderadoRut: apoderadoRut.trim(),
      parentesco: parentesco.trim(),
      firmadoAt,
      notas: notas.trim(),
      autonomo: autoFirma,
      fechaNacimiento: fechaNacimiento || undefined,
    };
  }

  function validateConsent(): string {
    if (apoderadoNombre.trim().length < 3)
      return "Escribe el nombre del apoderado.";
    if (!parentesco.trim()) return "Indica el parentesco.";
    if (!isValidRut(apoderadoRut)) return "El RUT del apoderado no es válido.";
    if (!firmadoAt) return "Indica la fecha de firma.";
    if (!confirmoFisico)
      return "Debes confirmar que el documento físico está firmado y archivado.";
    return "";
  }

  // Registra la autorización firmada. En edición llama al endpoint; en creación
  // la guarda localmente para enviarla junto con el alta del estudiante.
  async function registerConsent() {
    setConsentMsg("");
    const err = validateConsent();
    if (err) {
      setConsentMsg(err);
      return;
    }
    if (!isEdit) {
      // Aún no existe el estudiante: dejamos la autorización lista para el alta.
      setConsent({
        status: "otorgado",
        apoderadoNombre: apoderadoNombre.trim(),
        apoderadoRut: normalizeRut(apoderadoRut),
        parentesco: parentesco.trim(),
        firmadoAt,
        notas: notas.trim() || undefined,
      });
      setShowConsentForm(false);
      setConsentMsg("Autorización lista. Se guardará al crear el estudiante.");
      return;
    }
    setConsentSaving(true);
    try {
      const res = await fetch(`/api/students/${initial!._id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consentInput()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConsentMsg(data.error || "No se pudo registrar la autorización.");
        return;
      }
      setConsent(data.consent);
      setShowConsentForm(false);
      setConsentMsg("✅ Autorización registrada.");
    } catch {
      setConsentMsg("Error de conexión.");
    } finally {
      setConsentSaving(false);
    }
  }

  // Revoca la autorización (borra el descriptor facial del estudiante).
  async function revokeConsent() {
    if (!isEdit) {
      setConsent(undefined);
      setDescriptor(null);
      return;
    }
    if (
      !confirm(
        "¿Revocar la autorización? Se eliminará la cara registrada del " +
          "estudiante y deberá volver a autorizar para usar biometría."
      )
    )
      return;
    setConsentSaving(true);
    try {
      const res = await fetch(`/api/students/${initial!._id}/consent`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setConsentMsg(data.error || "No se pudo revocar.");
        return;
      }
      setConsent({ status: "revocado" });
      setDescriptor(null);
      setConsentMsg("Autorización revocada y cara eliminada.");
      void fetchRevocationLog();
      onSaved();
    } catch {
      setConsentMsg("Error de conexión.");
    } finally {
      setConsentSaving(false);
    }
  }

  async function save(force = false) {
    setError("");
    if (!nombre.trim() || !apellidos.trim() || !curso || !rut.trim()) {
      setError("Completa nombre, apellidos, curso y RUT.");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        nombre,
        apellidos,
        curso,
        rut,
        fechaNacimiento: fechaNacimiento || null,
      };
      if (descriptor) payload.faceDescriptor = descriptor;
      if (force) payload.force = true;
      // Al CREAR, enviamos la autorización junto con el alta (si se registró).
      if (!isEdit && consentGranted) payload.consent = consentInput();

      const res = await fetch(
        isEdit ? `/api/students/${initial!._id}` : "/api/students",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DUPLICATE_FACE") {
          const m = data.match || {};
          const ok = window.confirm(
            `⚠️ Esta cara se parece mucho a ${m.nombre || "otro estudiante"}` +
              `${m.curso ? ` (${m.curso})` : ""}` +
              `${m.score ? ` · ${m.score}% de similitud` : ""}.\n\n` +
              "¿Son personas distintas (gemelos o hermanos) y deseas enrolar de todos modos?"
          );
          if (ok) {
            await save(true);
            return;
          }
          setError("Enrolamiento cancelado: la cara ya estaba registrada.");
          return;
        }
        if (data.error === "CONSENT_REQUIRED") {
          setError(
            data.message ||
              "Falta la autorización del apoderado para registrar la cara."
          );
          return;
        }
        setError(data.error || "No se pudo guardar.");
        return;
      }
      await syncMemberships();
      onSaved();
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto">
      <div className="card p-6 w-full max-w-lg my-auto animate-pop">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black text-[#27407a]">
            {isEdit ? "Editar estudiante" : "Nuevo estudiante"}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl font-black text-[#9aa6bf]"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-game">Nombre</label>
            <input
              className="input-game"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Juan"
            />
          </div>
          <div>
            <label className="label-game">Apellidos</label>
            <input
              className="input-game"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              placeholder="Ej: Pérez González"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">Curso</label>
            <CursoSelect value={curso} onChange={setCurso} required />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">RUT</label>
            <RutInput value={rut} onChange={setRut} />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">Fecha de nacimiento (opcional)</label>
            <input
              type="date"
              className="input-game animate-pop"
              value={fechaNacimiento}
              max={todayISO()}
              onChange={(e) => setFechaNacimiento(e.target.value)}
            />
          </div>
          {fechaNacimiento && (
            <div className="sm:col-span-2 rounded-2xl p-3 text-xs border bg-[#f8fafc] border-slate-200">
              <span className="font-bold text-slate-500 block mb-1">Nivel de Autonomía (Ley 21.719 / 21.430):</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-800">
                  Edad calculada: {age} años
                </span>
                <span className={`px-2 py-0.5 rounded-full font-extrabold text-[10px] ${
                  autonomyTier === "plena"
                    ? "bg-indigo-100 text-indigo-700"
                    : autonomyTier === "progresiva"
                    ? "bg-sky-100 text-sky-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {autonomyTier === "plena" && "Plena Autonomía"}
                  {autonomyTier === "progresiva" && "Autonomía Progresiva"}
                  {autonomyTier === "tutela" && "Tutela"}
                </span>
              </div>
              <p className="text-[#9aa6bf] font-medium mt-1">
                {autonomyTier === "plena" && "El estudiante (mayor de 16 años) tiene autonomía plena para autorizar el tratamiento de su biometría."}
                {autonomyTier === "progresiva" && "El adolescente (14-15 años) requiere consentimiento de su apoderado y co-firma/asentimiento propio."}
                {autonomyTier === "tutela" && "El menor (menor de 14 años) requiere la autorización firmada de su apoderado (explicado en lenguaje claro)."}
              </p>
            </div>
          )}
        </div>

        {programs.length > 0 && (
          <div className="mt-5">
            <label className="label-game">Programas (listas)</label>
            <p className="text-xs text-[#9aa6bf] font-semibold mb-2">
              Marca a qué listas pertenece. Puede estar en ninguna o en varias.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {programs.map((p) => {
                const checked = memberOf.has(p._id!);
                return (
                  <label
                    key={p._id}
                    className={`flex items-center gap-2 rounded-xl border-2 p-2 cursor-pointer select-none ${
                      checked
                        ? "border-[#4f7cff] bg-[#f4f8ff]"
                        : "border-[#eef2ff]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProgram(p._id!)}
                      className="w-5 h-5 accent-[#4f7cff]"
                    />
                    <span className="text-lg">{p.icono}</span>
                    <span className="font-bold text-[#27407a] text-sm truncate">
                      {p.nombre}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* --- Autorización del apoderado (obligatoria para la cara) --- */}
        <div className="mt-5 rounded-2xl border-2 border-[#eef2ff] p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-bold text-[#41507a]">
                {autonomyTier === "plena" ? "Consentimiento autónomo del estudiante" : "Autorización del apoderado"}
              </span>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                    consentGranted
                      ? "bg-green-100 text-green-700"
                      : consent?.status === "revocado"
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {consentStatusLabel(consent?.status)}
                </span>
                {consent?.requiereRegularizacion && (
                  <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-orange-100 text-orange-700">
                    Regularizar
                  </span>
                )}
              </div>
            </div>
            {isEdit && (
              <a
                href={`/autorizacion/${initial!._id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-game btn-gray !py-2 !px-3 !text-sm whitespace-nowrap"
              >
                {consentGranted ? "🖨️ Imprimir" : "🖨️ Imprimir para firmar"}
              </a>
            )}
          </div>

          {consentGranted ? (
            <div className="mt-3 text-sm text-[#5b6b94] font-semibold">
              <div>
                {consent?.apoderadoNombre}
                {consent?.parentesco ? ` · ${consent.parentesco}` : ""}
              </div>
              {consent?.firmadoAt && (
                <div className="text-[#9aa6bf]">
                  Firmado el {consent.firmadoAt}
                </div>
              )}
              <button
                type="button"
                onClick={revokeConsent}
                disabled={consentSaving}
                className="btn-game btn-red !py-1.5 !px-3 !text-sm mt-3"
              >
                Revocar autorización
              </button>
              {revocationAuditId && (
                <a
                  href={`/certificado-eliminacion/${revocationAuditId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-2 text-xs font-bold text-[#4f7cff] underline"
                >
                  📄 Descargar Acta de Eliminación (ISO 27001)
                </a>
              )}
            </div>
          ) : consent?.status === "revocado" ? (
            <div className="mt-3 text-sm text-[#5b6b94] font-semibold">
              <p>La autorización fue revocada y la biometría eliminada.</p>
              {revocationAuditId && (
                <a
                  href={`/certificado-eliminacion/${revocationAuditId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-2 text-xs font-bold text-[#4f7cff] underline"
                >
                  📄 Descargar Acta de Eliminación (ISO 27001)
                </a>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-[#9aa6bf] font-semibold mb-2">
                {autonomyTier === "plena"
                  ? "El reconocimiento facial trata datos biométricos. El estudiante mayor de 16 años puede autorizar por sí mismo, o un apoderado puede firmar en su representación."
                  : autonomyTier === "progresiva"
                  ? "El adolescente (14-15 años) requiere la firma del apoderado y su co-asentimiento informado antes de capturar la cara."
                  : "El reconocimiento facial trata datos biométricos de un menor. Se necesita la autorización firmada del apoderado antes de capturar la cara."}
              </p>
              {!showConsentForm ? (
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowConsentForm(true)}
                    className="btn-game btn-blue !py-2 !px-3 !text-sm"
                  >
                    ✍️ Registrar autorización firmada
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {autonomyTier === "plena" && (
                    <label className="flex items-center gap-2 rounded-xl border-2 border-[#eef2ff] p-2 bg-[#f8fafc] cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoFirma}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAutoFirma(val);
                          if (val) {
                            setApoderadoNombre(`${nombre} ${apellidos}`.trim());
                            setApoderadoRut(rut);
                            setParentesco(ESTUDIANTE_TITULAR_PARENTESCO);
                            setConfirmoFisico(true);
                          } else {
                            setApoderadoNombre("");
                            setApoderadoRut("");
                            setParentesco("");
                            setConfirmoFisico(false);
                          }
                        }}
                        className="w-5 h-5 accent-[#4f7cff]"
                      />
                      <span className="text-xs font-bold text-[#27407a]">
                        ✍️ El propio estudiante firma por sí mismo (Plena Autonomía Ley 21.719)
                      </span>
                    </label>
                  )}
                  {autonomyTier === "progresiva" && (
                    <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-800">
                      Requiere documento con firma del apoderado y co-asentimiento del adolescente (14-15 años).
                    </div>
                  )}
                  <div>
                    <label className="label-game">Nombre del apoderado / consintiente</label>
                    <input
                      className="input-game"
                      value={apoderadoNombre}
                      disabled={autoFirma}
                      onChange={(e) => setApoderadoNombre(e.target.value)}
                      placeholder="Ej: María Pérez"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label-game">RUT del consintiente</label>
                      <RutInput
                        value={apoderadoRut}
                        disabled={autoFirma}
                        onChange={setApoderadoRut}
                      />
                    </div>
                    <div>
                      <label className="label-game">Parentesco</label>
                      <select
                        className="input-game"
                        value={parentesco}
                        disabled={autoFirma}
                        onChange={(e) => setParentesco(e.target.value)}
                      >
                        <option value="">Selecciona…</option>
                        {autoFirma && (
                          <option value={ESTUDIANTE_TITULAR_PARENTESCO}>
                            {ESTUDIANTE_TITULAR_PARENTESCO}
                          </option>
                        )}
                        {PARENTESCOS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label-game">Fecha de firma</label>
                    <input
                      type="date"
                      className="input-game"
                      value={firmadoAt}
                      max={todayISO()}
                      onChange={(e) => setFirmadoAt(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-game">
                      Observaciones (opcional)
                    </label>
                    <input
                      className="input-game"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Ej: archivado en carpeta 3°A"
                    />
                  </div>
                  <label className="flex items-start gap-2 text-sm font-semibold text-[#5b6b94]">
                    <input
                      type="checkbox"
                      checked={confirmoFisico}
                      disabled={autoFirma}
                      onChange={(e) => setConfirmoFisico(e.target.checked)}
                      className="w-5 h-5 accent-[#4f7cff] mt-0.5"
                    />
                    <span>
                      {autoFirma
                        ? "Confirmo que el documento de consentimiento autónomo está firmado por el estudiante y archivado físicamente."
                        : "Confirmo que el documento de autorización está firmado por el apoderado y archivado físicamente."}
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={registerConsent}
                      disabled={consentSaving}
                      className="btn-game btn-green !py-2 !px-4 !text-sm"
                    >
                      {consentSaving ? "Guardando…" : "Guardar autorización"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowConsentForm(false)}
                      className="btn-game btn-gray !py-2 !px-4 !text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {consentMsg && (
            <div className="mt-3 text-sm font-bold text-center text-[#41507a]">
              {consentMsg}
            </div>
          )}
        </div>

        {/* --- Derechos del titular (acceso / portabilidad) --- */}
        {isEdit && (
          <div className="mt-5 rounded-2xl border-2 border-[#eef2ff] p-4">
            <span className="font-bold text-[#41507a]">
              Derechos del titular
            </span>
            <p className="text-xs text-[#9aa6bf] font-semibold mt-1">
              Entrega al apoderado una copia de todos los datos del estudiante
              (acceso y portabilidad). La rectificación se hace editando esta
              ficha; la supresión, eliminando al estudiante; y la revocación,
              desde la autorización del apoderado.
            </p>
            <a
              href={`/api/students/${initial!._id}/export`}
              className="btn-game btn-gray !py-2 !px-3 !text-sm mt-3 inline-block"
            >
              ⬇️ Exportar datos (JSON)
            </a>
          </div>
        )}

        {/* --- Enrolar cara (bloqueado sin autorización) --- */}
        <div className="mt-5 rounded-2xl bg-[#f6f8ff] p-4">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#41507a]">
              Enrolar cara{" "}
              {descriptor
                ? "✅"
                : initial?.enrolled
                ? "(ya enrolado)"
                : "(opcional)"}
            </span>
            {captureUnlocked && (
              <button
                type="button"
                onClick={() => setShowCapture((s) => !s)}
                className="btn-game btn-purple !py-2 !px-4 !text-base"
              >
                {showCapture ? "Ocultar cámara" : "📸 Capturar"}
              </button>
            )}
          </div>
          {bypassConsent && !consentGranted && (
            <p className="mt-2 text-xs font-bold text-[#b45309]">
              ⚠️ Modo de prueba: captura habilitada sin autorización
              (NEXT_PUBLIC_BYPASS_CONSENT).
            </p>
          )}
          {!captureUnlocked ? (
            <p className="mt-2 text-sm font-semibold text-[#b45309]">
              🔒 Para capturar la cara, primero registra la autorización firmada
              del apoderado.
            </p>
          ) : (
            showCapture && (
              <div className="mt-4">
                <FaceCapture
                  onCapture={setDescriptor}
                  captured={Boolean(descriptor)}
                />
              </div>
            )
          )}
        </div>

        {error && (
          <div className="mt-4 text-center font-bold text-[#ef4444]">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save()}
            disabled={loading}
            className="btn-game btn-green flex-1"
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
          <button onClick={onClose} className="btn-game btn-gray flex-1">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
