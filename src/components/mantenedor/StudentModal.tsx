"use client";

import { useCallback, useEffect, useState } from "react";
import FaceCapture from "@/components/FaceCapture";
import RutInput from "@/components/RutInput";
import CursoSelect from "@/components/CursoSelect";
import { splitNombreCompleto } from "@/lib/curso";
import type { Program, StudentConsent } from "@/lib/types";
import { PARENTESCOS, consentStatusLabel } from "@/lib/consent";
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
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [showCapture, setShowCapture] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
                Autorización del apoderado
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
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-xs text-[#9aa6bf] font-semibold mb-2">
                El reconocimiento facial trata datos biométricos de un menor. Se
                necesita la autorización firmada del apoderado antes de capturar
                la cara.
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
                  <div>
                    <label className="label-game">Nombre del apoderado</label>
                    <input
                      className="input-game"
                      value={apoderadoNombre}
                      onChange={(e) => setApoderadoNombre(e.target.value)}
                      placeholder="Ej: María Pérez"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label-game">RUT del apoderado</label>
                      <RutInput
                        value={apoderadoRut}
                        onChange={setApoderadoRut}
                      />
                    </div>
                    <div>
                      <label className="label-game">Parentesco</label>
                      <select
                        className="input-game"
                        value={parentesco}
                        onChange={(e) => setParentesco(e.target.value)}
                      >
                        <option value="">Selecciona…</option>
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
                      onChange={(e) => setConfirmoFisico(e.target.checked)}
                      className="w-5 h-5 accent-[#4f7cff] mt-0.5"
                    />
                    <span>
                      Confirmo que el documento de autorización está firmado por
                      el apoderado y archivado físicamente.
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
