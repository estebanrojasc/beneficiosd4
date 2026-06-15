"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import type { Program, ProgramModalidad } from "@/lib/types";
import { isValidRut, formatRut, normalizeRut } from "@/lib/rut";
import { fullName } from "@/lib/curso";
import CursoSelect from "@/components/CursoSelect";
import RutInput from "@/components/RutInput";
import FaceCapture from "@/components/FaceCapture";
import BulkAIImport from "@/components/mantenedor/BulkAIImport";
import StudentModal, { type StudentLite } from "@/components/mantenedor/StudentModal";

const ICON_CHOICES = ["🍽️", "📦", "🪪", "🎒", "📚", "🎫", "💊", "🧥", "🗂️"];

// Clave cercana sugerida a partir del nombre y el año (ej. "almuerzo2026").
function claveSugerida(nombre: string): string {
  const base = (nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  return `${base || "programa"}${new Date().getFullYear()}`;
}

interface Branding {
  nombre: string;
  logo: string;
}

// Encabezado institucional (logo + nombre) para los reportes impresos.
function brandingHeaderHtml(b: Branding): string {
  if (!b.nombre && !b.logo) return "";
  return `<div style="display:flex;align-items:center;gap:12px;border-bottom:2px solid #eef2ff;padding-bottom:8px;margin-bottom:12px">
    ${b.logo ? `<img src="${b.logo}" style="height:48px;width:auto" alt="logo" />` : ""}
    ${b.nombre ? `<div style="font-size:18px;font-weight:bold;color:#27407a">${escapeHtml(b.nombre)}</div>` : ""}
  </div>`;
}

type Mode = "operacion" | "gestion";

export default function ProgramasTab({ mode = "gestion" }: { mode?: Mode }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCerrados, setShowCerrados] = useState(false);

  const activos = programs.filter((p) => p.estado === "activo");
  const cerrados = programs.filter((p) => p.estado !== "activo");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/programs", { cache: "no-store" });
      setPrograms(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const current = programs.find((p) => p._id === selected) || null;

  if (current) {
    return (
      <ProgramDetail
        program={current}
        mode={mode}
        onBack={() => setSelected(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div className="animate-pop space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-[#27407a]">
          {mode === "operacion" ? "Operar un programa" : "Programas"}
        </h2>
        {mode === "gestion" && (
          <button
            onClick={() => setShowCreate(true)}
            className="btn-game btn-blue !py-2 !px-4"
          >
            ➕ Nuevo programa
          </button>
        )}
      </div>
      <p className="text-sm text-[#6b7aa0] font-semibold">
        {mode === "operacion"
          ? "Elige un programa para validar, ver su lista y sus reportes."
          : "Crea y configura listas que reutilizan los enrolamientos: almuerzo, entrega de materiales, tarjetas, etc."}
      </p>

      {loading ? (
        <div className="text-[#6b7aa0] font-bold py-6">Cargando...</div>
      ) : (
        <div className="space-y-5">
          <ProgramGroup
            programs={activos}
            onSelect={(id) => setSelected(id)}
            empty="No hay programas activos."
          />
          {cerrados.length > 0 && (
            <div>
              <button
                onClick={() => setShowCerrados((s) => !s)}
                className="flex items-center gap-2 font-black text-[#6b7aa0] mb-2"
              >
                {showCerrados ? "▼" : "▶"} Finalizados ({cerrados.length})
              </button>
              {showCerrados && (
                <ProgramGroup
                  programs={cerrados}
                  onSelect={(id) => setSelected(id)}
                  dimmed
                />
              )}
            </div>
          )}
        </div>
      )}

      {mode === "gestion" && showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ProgramGroup({
  programs,
  onSelect,
  dimmed,
  empty,
}: {
  programs: Program[];
  onSelect: (id: string) => void;
  dimmed?: boolean;
  empty?: string;
}) {
  if (programs.length === 0)
    return empty ? (
      <div className="text-[#9aa6bf] font-bold py-2">{empty}</div>
    ) : null;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {programs.map((p) => (
        <button
          key={p._id}
          onClick={() => onSelect(p._id!)}
          className={`card p-4 text-left flex items-center gap-3 hover:shadow-lg transition ${
            dimmed ? "opacity-60" : ""
          }`}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: `${p.color}22` }}
          >
            {p.icono}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-black text-[#27407a] truncate">{p.nombre}</div>
            <div className="text-xs text-[#9aa6bf] font-semibold">
              {p.modalidad === "temporal" ? "Recurrente" : "Puntual"}
            </div>
          </div>
          {p.estado !== "activo" && (
            <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-[#eef0f5] text-[#6b7aa0]">
              Finalizado
            </span>
          )}
          <span className="text-[#9aa6bf] font-black">→</span>
        </button>
      ))}
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [modalidad, setModalidad] = useState<ProgramModalidad>("temporal");
  const [requiereMembresia, setRequiereMembresia] = useState(true);
  const [permitirAutoRegistro, setPermitirAutoRegistro] = useState(false);
  const [icono, setIcono] = useState("📦");
  const [qrVentanaMin, setQrVentanaMin] = useState(0);
  const [umbral, setUmbral] = useState(70);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!nombre.trim()) {
      setError("Escribe un nombre.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          descripcion,
          modalidad,
          requiereMembresia,
          permitirAutoRegistro,
          icono,
          qrVentanaMin,
          umbralAsistencia: umbral,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "No se pudo crear.");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="card p-6 w-full max-w-lg animate-pop max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-black text-[#27407a] mb-4">
          Nuevo programa
        </h2>

        <label className="label-game">Nombre</label>
        <input
          className="input-game mb-3"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Entrega de materiales"
        />

        <label className="label-game">Descripción (opcional)</label>
        <input
          className="input-game mb-3"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />

        <label className="label-game">Tipo de programa (define el reporte)</label>
        <div className="grid grid-cols-2 gap-2 mb-1">
          <button
            type="button"
            onClick={() => setModalidad("temporal")}
            className={`rounded-2xl p-3 border-2 text-left ${
              modalidad === "temporal"
                ? "border-[#4f7cff] bg-[#f4f8ff]"
                : "border-[#eef2ff]"
            }`}
          >
            <div className="font-black text-[#27407a]">🔁 Temporal</div>
            <div className="text-xs text-[#6b7aa0] font-semibold">
              Se repite varios días. Ej: asistencia al almuerzo. El reporte es una
              tabla mensual con % de asistencia.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setModalidad("puntual")}
            className={`rounded-2xl p-3 border-2 text-left ${
              modalidad === "puntual"
                ? "border-[#4f7cff] bg-[#f4f8ff]"
                : "border-[#eef2ff]"
            }`}
          >
            <div className="font-black text-[#27407a]">📍 Puntual</div>
            <div className="text-xs text-[#6b7aa0] font-semibold">
              Una sola vez por persona. Ej: entrega de materiales o tarjetas. El
              reporte es entregados vs. pendientes.
            </div>
          </button>
        </div>
        <p className="text-[11px] text-[#9aa6bf] mb-3">
          Esto no se puede cambiar después, porque define cómo se guardan los
          registros.
        </p>

        <label className="label-game">Ícono</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {ICON_CHOICES.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcono(ic)}
              className={`w-11 h-11 rounded-xl text-2xl border-2 ${
                icono === ic ? "border-[#4f7cff] bg-[#f4f8ff]" : "border-[#eef2ff]"
              }`}
            >
              {ic}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-3 mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={requiereMembresia}
            onChange={(e) => setRequiereMembresia(e.target.checked)}
            className="w-6 h-6 accent-[#4f7cff]"
          />
          <span className="font-bold text-[#27407a]">
            Requiere lista de autorizados
            <span className="block text-xs text-[#6b7aa0] font-semibold">
              Si lo desactivas, cualquier estudiante enrolado puede registrarse.
            </span>
          </span>
        </label>

        <label className="flex items-center gap-3 mb-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={permitirAutoRegistro}
            onChange={(e) => setPermitirAutoRegistro(e.target.checked)}
            className="w-6 h-6 accent-[#4f7cff]"
          />
          <span className="font-bold text-[#27407a]">
            Permitir auto-registro por QR
            <span className="block text-xs text-[#6b7aa0] font-semibold">
              El estudiante se marca solo desde su celular escaneando el QR. Si lo
              dejas apagado, no habrá QR externo: cada coordinador o docente deberá
              enrolar/registrar.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label-game">Ventana del QR (min)</label>
            <input
              type="number"
              min={0}
              className="input-game"
              value={qrVentanaMin}
              onChange={(e) => setQrVentanaMin(Number(e.target.value))}
              disabled={!permitirAutoRegistro}
            />
            <p className="text-[11px] text-[#9aa6bf] mt-1">
              Minutos que el QR acepta registros tras abrirlo. <b>0 = siempre
              abierto</b> mientras el programa esté activo.
            </p>
          </div>
          {modalidad === "temporal" && (
            <div>
              <label className="label-game">Umbral baja asist. (%)</label>
              <input
                type="number"
                min={1}
                max={100}
                className="input-game"
                value={umbral}
                onChange={(e) => setUmbral(Number(e.target.value))}
              />
              <p className="text-[11px] text-[#9aa6bf] mt-1">
                En el reporte se marcan en rojo quienes asistan por debajo de este
                porcentaje.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 text-center font-bold text-[#ef4444]">{error}</div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="btn-game btn-gray flex-1">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-game btn-blue flex-1"
          >
            {saving ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Detalle del programa ----------------------------------------------------

type DetailSection = "miembros" | "qr" | "reporte" | "ajustes";

function ProgramDetail({
  program,
  mode,
  onBack,
  onChanged,
}: {
  program: Program;
  mode: Mode;
  onBack: () => void;
  onChanged: () => void;
}) {
  // Operación = usar el programa (validar/lista/reporte).
  // Gestión = configurarlo (ajustes/eliminar).
  const sections: { id: DetailSection; label: string; emoji: string }[] =
    mode === "operacion"
      ? [
          { id: "reporte", label: "Reporte", emoji: "📊" },
          { id: "miembros", label: "Lista", emoji: "📋" },
          { id: "qr", label: "QR", emoji: "🔳" },
        ]
      : [{ id: "ajustes", label: "Ajustes", emoji: "⚙️" }];

  const [section, setSection] = useState<DetailSection>(sections[0].id);
  const [busy, setBusy] = useState(false);
  const activo = program.estado === "activo";

  async function toggleEstado() {
    const nuevo = activo ? "cerrado" : "activo";
    if (
      activo &&
      !confirm(
        `¿Finalizar "${program.nombre}"? Dejará de aparecer entre los activos y no se podrá validar ni registrar (sus reportes se conservan). Podrás reactivarlo cuando quieras.`
      )
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/programs/${program._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevo }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-pop space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="btn-game btn-gray !py-2 !px-3">
          ←
        </button>
        <div className="text-3xl">{program.icono}</div>
        <div className="min-w-0">
          <h2 className="text-xl font-black text-[#27407a] truncate">
            {program.nombre}
          </h2>
          <div className="text-xs text-[#9aa6bf] font-semibold">
            {program.modalidad === "temporal" ? "Recurrente" : "Puntual"}
            {!activo ? " · Finalizado" : ""}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {mode === "operacion" && activo && (
            <Link
              href={`/validar?program=${program.slug || program._id}&from=mantenedor`}
              className="btn-game btn-green !py-2 !px-4"
            >
              📷 Validar
            </Link>
          )}
          <button
            onClick={toggleEstado}
            disabled={busy}
            className={`btn-game !py-2 !px-4 ${
              activo ? "btn-gray" : "btn-green"
            }`}
            title={activo ? "Finalizar programa" : "Reactivar programa"}
          >
            {activo ? "⏹️ Finalizar" : "▶️ Reactivar"}
          </button>
        </div>
      </div>

      {!activo && (
        <div className="rounded-2xl bg-[#fff7e6] border-2 border-[#ffe2a8] p-3 text-sm font-bold text-[#9a6a00]">
          Este programa está finalizado: no acepta validaciones ni registros. Sus
          reportes siguen disponibles. Usa “Reactivar” para volver a operarlo.
        </div>
      )}

      {sections.length > 1 && (
        <nav className="flex gap-2 overflow-x-auto">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`whitespace-nowrap rounded-2xl px-4 py-2 font-extrabold transition shrink-0 ${
                section === s.id
                  ? "bg-[#4f7cff] text-white shadow"
                  : "bg-white text-[#41507a] border-2 border-[#eef2ff]"
              }`}
            >
              <span className="mr-1">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </nav>
      )}

      {section === "reporte" && <ReportSection program={program} />}
      {section === "miembros" && (
        <MembersSection program={program} onChanged={onChanged} />
      )}
      {section === "qr" && <QRSection program={program} onChanged={onChanged} />}
      {section === "ajustes" && (
        <SettingsSection program={program} onChanged={onChanged} onDeleted={onBack} />
      )}
    </div>
  );
}

// --- Miembros ----------------------------------------------------------------

interface MemberView {
  rut: string;
  nombre: string;
  apellidos: string;
  curso: string;
  enrolled: boolean;
}

function MembersSection({
  program,
  onChanged,
}: {
  program: Program;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<MemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [rut, setRut] = useState("");
  const [filtroCurso, setFiltroCurso] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSource, setBulkSource] = useState<"archivo" | "texto" | null>(null);
  const [msg, setMsg] = useState("");
  const [enrollRow, setEnrollRow] = useState<MemberView | null>(null);
  const [editInitial, setEditInitial] = useState<Partial<StudentLite> | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/programs/${program._id}/members`, {
        cache: "no-store",
      });
      setMembers(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, [program._id]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function add() {
    if (!isValidRut(rut)) {
      setError("RUT inválido");
      return;
    }
    setError("");
    setMsg("");
    const res = await fetch(`/api/programs/${program._id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rut }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.message || d.error || "No se pudo agregar");
      return;
    }
    const added = normalizeRut(rut);
    setRut("");
    // Recargamos la lista y revisamos si quedó enrolado (cara registrada).
    let fresh: MemberView[] = [];
    try {
      const r2 = await fetch(`/api/programs/${program._id}/members`, {
        cache: "no-store",
      });
      fresh = r2.ok ? await r2.json() : [];
      setMembers(fresh);
    } catch {
      load();
    }
    const row = fresh.find((m) => m.rut === added);
    if (row && !row.enrolled) {
      // No está enrolado: preguntamos si se quiere enrolar la cara ahora.
      const nombre = fullName(row.nombre, row.apellidos) || formatRut(row.rut);
      if (
        confirm(
          `${nombre} se agregó a la lista, pero no tiene cara enrolada. ¿Enrolar ahora?`
        )
      ) {
        setMsg("");
        setEnrollRow(row);
      } else {
        setMsg("✅ Agregado (puedes enrolar la cara después con 📸).");
      }
    } else {
      setMsg("✅ Agregado");
    }
  }

  // Abre la ficha del estudiante para editar (o crearla si aún no existe).
  async function editMember(m: MemberView) {
    let st: Partial<StudentLite> | null = null;
    try {
      const res = await fetch(
        `/api/students?q=${encodeURIComponent(m.rut)}`,
        { cache: "no-store" }
      );
      const arr = res.ok ? await res.json() : [];
      const found = Array.isArray(arr)
        ? arr.find(
            (x: { rut?: string }) => normalizeRut(x.rut || "") === m.rut
          )
        : null;
      if (found)
        st = {
          _id: found._id,
          nombre: found.nombre,
          apellidos: found.apellidos,
          curso: found.curso,
          rut: found.rut,
          enrolled: found.enrolled,
        };
    } catch {
      /* sin conexión: abrimos en modo creación con lo de la lista */
    }
    setEditInitial(
      st || {
        rut: m.rut,
        nombre: m.nombre,
        apellidos: m.apellidos,
        curso: m.curso,
      }
    );
  }

  async function remove(r: string) {
    if (!confirm(`¿Quitar ${formatRut(r)} de la lista?`)) return;
    await fetch(`/api/programs/${program._id}/members?rut=${encodeURIComponent(r)}`, {
      method: "DELETE",
    });
    load();
  }

  const cursos = useMemo(
    () =>
      Array.from(new Set(members.map((m) => m.curso || "Sin curso"))).sort((a, b) =>
        a.localeCompare(b, "es", { numeric: true })
      ),
    [members]
  );

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return members.filter((m) => {
      if (filtroCurso && (m.curso || "Sin curso") !== filtroCurso) return false;
      if (!term) return true;
      const hay = `${m.nombre} ${m.apellidos} ${m.rut}`.toLowerCase();
      return hay.includes(term);
    });
  }, [members, filtroCurso, q]);

  // Agrupamos por curso; "Sin curso" (falta info) va al final.
  const grupos = useMemo(() => {
    const map = new Map<string, MemberView[]>();
    for (const m of visibles) {
      const key = m.curso || "Sin curso";
      const arr = map.get(key) || [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Sin curso") return 1;
      if (b[0] === "Sin curso") return -1;
      return a[0].localeCompare(b[0], "es", { numeric: true });
    });
  }, [visibles]);

  if (program.requiereMembresia === false) {
    return (
      <div className="card p-5 text-[#6b7aa0] font-semibold">
        Este programa no usa lista de autorizados: cualquier estudiante enrolado
        puede registrarse. Cambia esto en Gestión → Programas → Ajustes.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setAddOpen((o) => !o)}
        className="btn-game btn-blue w-full !justify-between"
      >
        <span>➕ Agregar a la lista</span>
        <span>{addOpen ? "▲" : "▼"}</span>
      </button>

      {addOpen && (
        <div className="card p-4 space-y-3">
          <div>
            <label className="label-game">Agregar por RUT</label>
            <div className="flex gap-2">
              <RutInput value={rut} onChange={setRut} className="input-game" />
              <button onClick={add} className="btn-game btn-blue !px-4">
                ➕
              </button>
            </div>
          </div>

          <button
            onClick={() => setBulkOpen((b) => !b)}
            className="font-bold text-[#4f7cff]"
          >
            {bulkOpen ? "▲ Ocultar carga masiva" : "▼ Carga masiva"}
          </button>
          {bulkOpen && (
            <div className="space-y-4">
              <div>
                <div className="font-bold text-[#41507a] text-sm mb-1">
                  Pegar lista (texto)
                </div>
                <p className="text-sm text-[#6b7aa0] font-semibold mb-2">
                  Pega una lista y revísala (RUT, duplicados y cursos) antes de
                  agregarla.
                </p>
                <button
                  onClick={() => setBulkSource("texto")}
                  className="btn-game btn-purple"
                >
                  📥 Importar lista pegada
                </button>
              </div>

              <div className="border-t-2 border-[#eef2ff] pt-3">
                <div className="font-bold text-[#41507a] text-sm mb-1">
                  Desde un archivo (IA)
                </div>
                <p className="text-sm text-[#6b7aa0] font-semibold mb-2">
                  Sube un PDF, imagen, Excel o Word y la IA extrae los
                  estudiantes para revisarlos y agregarlos a esta lista.
                </p>
                <button
                  onClick={() => setBulkSource("archivo")}
                  className="btn-game btn-green"
                >
                  🤖 Carga masiva con IA
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="font-bold text-[#ef4444] text-sm">{error}</div>
          )}
          {msg && <div className="font-bold text-[#22a558] text-sm">{msg}</div>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input-game !py-2 flex-1 min-w-[160px]"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 Buscar por nombre o RUT"
        />
        <select
          className="input-game !w-auto !py-2"
          value={filtroCurso}
          onChange={(e) => setFiltroCurso(e.target.value)}
        >
          <option value="">Todos los cursos ({members.length})</option>
          {cursos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="text-xs font-bold text-[#9aa6bf]">
        {visibles.length} de {members.length} · sin cara:{" "}
        {members.filter((m) => !m.enrolled).length}
      </div>

      {loading ? (
        <div className="text-[#6b7aa0] font-bold py-6">Cargando...</div>
      ) : visibles.length === 0 ? (
        <div className="text-[#6b7aa0] font-bold py-6">Sin resultados.</div>
      ) : (
        <div className="space-y-4">
          {grupos.map(([curso, items]) => (
            <div key={curso} className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h4 className="font-black text-[#27407a]">{curso}</h4>
                <span className="text-xs font-bold text-[#9aa6bf]">
                  ({items.length})
                </span>
                {curso === "Sin curso" && (
                  <span className="text-xs font-bold text-[#c0392b]">
                    falta info de curso
                  </span>
                )}
              </div>
              {items.map((m) => (
                <div key={m.rut} className="card p-3 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-[#27407a] truncate">
                      {fullName(m.nombre, m.apellidos) || "Sin nombre"}
                    </div>
                    <div className="text-xs text-[#9aa6bf] font-semibold">
                      {formatRut(m.rut)}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-black px-2 py-1 rounded-lg ${
                      m.enrolled
                        ? "bg-[#eafaf0] text-[#1c7a44]"
                        : "bg-[#fdeaea] text-[#c0392b]"
                    }`}
                  >
                    {m.enrolled ? "Cara ✓" : "Sin cara"}
                  </span>
                  <button
                    onClick={() => editMember(m)}
                    className="btn-game btn-orange !py-1.5 !px-3 !text-sm"
                    title="Editar datos del estudiante"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setEnrollRow(m)}
                    className={`btn-game !py-1.5 !px-3 !text-sm ${
                      m.enrolled ? "btn-gray" : "btn-purple"
                    }`}
                    title={m.enrolled ? "Volver a enrolar la cara" : "Enrolar cara"}
                  >
                    {m.enrolled ? "↻" : "📸"}
                  </button>
                  <button
                    onClick={() => remove(m.rut)}
                    className="btn-game btn-red !py-1.5 !px-3 !text-sm"
                    title="Quitar de la lista"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {enrollRow && (
        <EnrollModal
          program={program}
          row={enrollRow}
          onClose={() => setEnrollRow(null)}
          onDone={() => {
            setEnrollRow(null);
            load();
            onChanged();
          }}
        />
      )}

      {bulkSource && (
        <BulkAIImport
          source={bulkSource}
          programId={program._id ?? ""}
          onClose={() => setBulkSource(null)}
          onDone={() => {
            setBulkSource(null);
            load();
            onChanged();
          }}
        />
      )}

      {editInitial && (
        <StudentModal
          initial={editInitial}
          onClose={() => setEditInitial(null)}
          onSaved={() => {
            setEditInitial(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

// Enrolamiento rápido de la cara desde la lista del programa (docente en sala).
function EnrollModal({
  program,
  row,
  onClose,
  onDone,
}: {
  program: Program;
  row: MemberView;
  onClose: () => void;
  onDone: () => void;
}) {
  const [nombre, setNombre] = useState(row.nombre || "");
  const [apellidos, setApellidos] = useState(row.apellidos || "");
  const [curso, setCurso] = useState(row.curso || "");
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function save(force = false) {
    setError("");
    if (!nombre.trim() || !apellidos.trim()) {
      setError("Escribe nombre y apellidos.");
      return;
    }
    if (!curso) {
      setError("Selecciona el curso.");
      return;
    }
    if (!descriptor) {
      setError("Primero captura la cara.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rut: row.rut,
          nombre,
          apellidos,
          curso,
          faceDescriptor: descriptor,
          force,
        }),
      });
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
            setLoading(false);
            await save(true);
            return;
          }
          setError("Enrolamiento cancelado: la cara ya estaba registrada.");
          return;
        }
        setError(data.error || "No se pudo enrolar.");
        return;
      }
      // Mantenemos nombre/curso del miembro en la lista del programa.
      await fetch(`/api/programs/${program._id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: row.rut, nombre, apellidos, curso }),
      }).catch(() => {});
      onDone();
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 overflow-y-auto">
      <div className="card p-6 w-full max-w-lg my-auto animate-pop">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-2xl font-black text-[#27407a]">Enrolar cara</h2>
          <button onClick={onClose} className="text-2xl font-black text-[#9aa6bf]">
            ✕
          </button>
        </div>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          {formatRut(row.rut)}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label-game">Nombre</label>
            <input
              className="input-game"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>
          <div>
            <label className="label-game">Apellidos</label>
            <input
              className="input-game"
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-game">Curso</label>
            <CursoSelect value={curso} onChange={setCurso} required />
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-[#f6f8ff] p-4">
          <FaceCapture onCapture={setDescriptor} captured={Boolean(descriptor)} />
        </div>

        {error && (
          <div className="mt-4 text-center font-bold text-[#ef4444]">{error}</div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={() => save()}
            disabled={loading || !descriptor}
            className="btn-game btn-green flex-1"
          >
            {loading ? "Guardando..." : "Enrolar ✅"}
          </button>
          <button onClick={onClose} className="btn-game btn-gray flex-1">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// --- QR ----------------------------------------------------------------------

function QRSection({
  program,
  onChanged,
}: {
  program: Program;
  onChanged: () => void;
}) {
  const [dataUrl, setDataUrl] = useState("");
  const [url, setUrl] = useState("");
  const [nowTs, setNowTs] = useState(0);
  const [branding, setBranding] = useState<Branding>({ nombre: "", logo: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      setUrl(`${window.location.origin}/r/${program.qrToken}`);
      setNowTs(Date.now());
    }, 0);
    return () => window.clearTimeout(t);
  }, [program.qrToken, program.qrOpenAt]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d)
            setBranding({
              nombre: d.establecimientoNombre || "",
              logo: d.logo || "",
            });
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, {
      width: 520,
      margin: 2,
      color: { dark: "#27407a", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/programs/${program._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  }

  const windowOpen =
    program.qrVentanaMin <= 0
      ? true
      : program.qrOpenAt && nowTs
      ? nowTs <
        new Date(program.qrOpenAt).getTime() + program.qrVentanaMin * 60_000
      : false;

  function printQR() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>QR ${program.nombre}</title></head>
      <body style="text-align:center;font-family:sans-serif;padding:40px">
        ${brandingHeaderHtml(branding)}
        <h1 style="color:#27407a">${program.icono} ${program.nombre}</h1>
        <p style="font-size:18px;color:#444">Escanea para registrarte</p>
        <img src="${dataUrl}" style="width:420px;height:420px" />
        <p style="color:#666">${url}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  if (!program.permitirAutoRegistro) {
    return (
      <div className="card p-6 max-w-xl mx-auto text-center space-y-2">
        <div className="text-4xl">🔒</div>
        <h3 className="text-xl font-black text-[#27407a]">
          Auto-registro desactivado
        </h3>
        <p className="text-sm text-[#6b7aa0] font-semibold">
          Este programa no tiene QR externo: cada coordinador o docente debe
          enrolar/registrar desde el validador. Para habilitar el auto-registro,
          actívalo en Gestión → Programas → Ajustes (&quot;Permitir auto-registro
          por QR&quot;).
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 max-w-xl mx-auto text-center">
      <h3 className="text-xl font-black text-[#27407a] mb-1">
        QR de auto-registro
      </h3>
      <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
        El estudiante lo escanea, escribe su RUT y confirma con su cara
        (verificada contra su enrolamiento).
      </p>

      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="QR registro"
          className="mx-auto rounded-2xl border-4 border-[#eef2ff] w-56 h-56"
        />
      ) : (
        <div className="text-[#6b7aa0] font-bold py-10">Generando QR...</div>
      )}

      <div className="mt-3 text-xs text-[#9aa6bf] break-all">{url}</div>

      <div
        className={`mt-4 rounded-2xl p-3 font-bold ${
          windowOpen
            ? "bg-[#eafaf0] text-[#1c7a44]"
            : "bg-[#fdeaea] text-[#c0392b]"
        }`}
      >
        {program.qrVentanaMin <= 0
          ? "Registro siempre abierto (mientras el programa esté activo)"
          : windowOpen
          ? `Registro ABIERTO (ventana de ${program.qrVentanaMin} min)`
          : "Registro CERRADO"}
      </div>

      <div className="flex flex-wrap gap-2 mt-4 justify-center">
        <button onClick={printQR} className="btn-game btn-purple !px-4">
          🖨️ Imprimir
        </button>
        {program.qrVentanaMin > 0 && (
          <button
            onClick={() => patch({ abrirRegistro: true })}
            className="btn-game btn-green !px-4"
          >
            ▶️ Abrir ventana
          </button>
        )}
        {program.qrVentanaMin > 0 && (
          <button
            onClick={() => patch({ cerrarRegistro: true })}
            className="btn-game btn-gray !px-4"
          >
            ⏹️ Cerrar
          </button>
        )}
        <button
          onClick={() => {
            if (confirm("¿Regenerar el QR? El anterior dejará de funcionar."))
              patch({ regenerarToken: true });
          }}
          className="btn-game btn-orange !px-4"
        >
          ♻️ Regenerar
        </button>
      </div>
    </div>
  );
}

// --- Reporte -----------------------------------------------------------------

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface TemporalStudent {
  rut: string;
  nombre: string;
  curso: string;
  attended: string[];
  count: number;
  percentage: number;
}
interface PuntualStudent {
  rut: string;
  nombre: string;
  curso: string;
  delivered: boolean;
  fecha?: string;
}

function monthNow(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

function ReportSection({ program }: { program: Program }) {
  const [month, setMonth] = useState(monthNow());
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [soloBajos, setSoloBajos] = useState(false);
  const [branding, setBranding] = useState<Branding>({ nombre: "", logo: "" });

  useEffect(() => {
    const t = window.setTimeout(() => {
      fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d)
            setBranding({
              nombre: d.establecimientoNombre || "",
              logo: d.logo || "",
            });
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = program.modalidad === "temporal" ? `?month=${month}` : "";
      const res = await fetch(`/api/programs/${program._id}/report${qs}`, {
        cache: "no-store",
      });
      setData(res.ok ? await res.json() : null);
    } finally {
      setLoading(false);
    }
  }, [program._id, program.modalidad, month]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (loading) return <div className="text-[#6b7aa0] font-bold py-6">Cargando...</div>;
  if (!data) return <div className="text-[#6b7aa0] font-bold py-6">Sin datos.</div>;

  if (program.modalidad === "puntual") {
    return (
      <PuntualReport program={program} data={data} branding={branding} />
    );
  }

  const days: string[] = data.days || [];
  const umbral: number = data.umbral || 70;
  let students: TemporalStudent[] = data.students || [];
  if (soloBajos) students = students.filter((s) => s.percentage < umbral);

  function exportPdf() {
    const rows = (data.students as TemporalStudent[])
      .map(
        (s) => `<tr>
          <td>${escapeHtml(s.curso || "—")}</td>
          <td>${escapeHtml(s.nombre)}</td>
          ${days.map((d) => `<td style="text-align:center">${s.attended.includes(d) ? "✓" : "·"}</td>`).join("")}
          <td style="text-align:center"><b>${s.count}</b></td>
          <td style="text-align:center;color:${s.percentage < umbral ? "#c0392b" : "#1c7a44"}"><b>${s.percentage}%</b></td>
        </tr>`
      )
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Reporte ${escapeHtml(program.nombre)} ${month}</title>
      <style>@page{size:A4 landscape;margin:12mm}body{font-family:sans-serif;color:#222}
      h1{color:#27407a}table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #ccc;padding:3px 5px}th{background:#eef2ff}</style></head>
      <body>${brandingHeaderHtml(branding)}<h1>${program.icono} ${escapeHtml(program.nombre)} — ${month}</h1>
      <p>Días con servicio: ${days.length} · Umbral baja asistencia: ${umbral}%</p>
      <table><thead><tr><th>Curso</th><th>Nombre</th>
      ${days.map((d) => `<th>${d.slice(8)}</th>`).join("")}
      <th>Total</th><th>%</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          className="input-game !w-auto !py-2"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <label className="flex items-center gap-2 font-bold text-[#41507a] text-sm">
          <input
            type="checkbox"
            checked={soloBajos}
            onChange={(e) => setSoloBajos(e.target.checked)}
            className="w-5 h-5 accent-[#ef4444]"
          />
          Solo baja asistencia
        </label>
        <button onClick={exportPdf} className="btn-game btn-purple !py-2 !px-4 ml-auto">
          🖨️ PDF
        </button>
      </div>

      <div className="text-sm font-semibold text-[#6b7aa0]">
        {days.length} días con servicio · {students.length} estudiantes
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            <tr className="bg-[#eef2ff]">
              <th className="p-2 text-left sticky left-0 bg-[#eef2ff]">Estudiante</th>
              {days.map((d) => (
                <th key={d} className="p-1 font-bold">
                  {d.slice(8)}
                </th>
              ))}
              <th className="p-2">%</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.rut} className="border-b border-[#eef2ff]">
                <td className="p-2 sticky left-0 bg-white">
                  <div className="font-bold text-[#27407a]">{s.nombre}</div>
                  <div className="text-xs text-[#9aa6bf]">{s.curso}</div>
                </td>
                {days.map((d) => (
                  <td key={d} className="text-center">
                    {s.attended.includes(d) ? "✓" : "·"}
                  </td>
                ))}
                <td
                  className={`text-center font-black ${
                    s.percentage < umbral ? "text-[#c0392b]" : "text-[#1c7a44]"
                  }`}
                >
                  {s.percentage}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PuntualReport({
  program,
  data,
  branding,
}: {
  program: Program;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  branding: Branding;
}) {
  const [soloPendientes, setSoloPendientes] = useState(false);
  let students: PuntualStudent[] = data.students || [];
  if (soloPendientes) students = students.filter((s) => !s.delivered);

  function exportPdf() {
    const rows = (data.students as PuntualStudent[])
      .map(
        (s) => `<tr>
          <td>${escapeHtml(s.curso || "—")}</td>
          <td>${escapeHtml(s.nombre)}</td>
          <td style="text-align:center;color:${s.delivered ? "#1c7a44" : "#c0392b"}">
            ${s.delivered ? "Entregado" : "Pendiente"}</td>
          <td style="text-align:center">${s.fecha || "—"}</td>
        </tr>`
      )
      .join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Reporte ${escapeHtml(program.nombre)}</title>
      <style>@page{size:A4;margin:14mm}body{font-family:sans-serif;color:#222}
      h1{color:#27407a}table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #ccc;padding:4px 6px}th{background:#eef2ff}</style></head>
      <body>${brandingHeaderHtml(branding)}<h1>${program.icono} ${escapeHtml(program.nombre)}</h1>
      <p>Entregados: ${data.deliveredCount} de ${data.total}</p>
      <table><thead><tr><th>Curso</th><th>Nombre</th><th>Estado</th><th>Fecha</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3 text-center">
          <div className="text-2xl font-black text-[#1c7a44]">
            {data.deliveredCount}
          </div>
          <div className="text-xs font-bold text-[#6b7aa0]">Entregados</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-black text-[#c0392b]">
            {data.total - data.deliveredCount}
          </div>
          <div className="text-xs font-bold text-[#6b7aa0]">Pendientes</div>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-black text-[#27407a]">{data.total}</div>
          <div className="text-xs font-bold text-[#6b7aa0]">Total</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 font-bold text-[#41507a] text-sm">
          <input
            type="checkbox"
            checked={soloPendientes}
            onChange={(e) => setSoloPendientes(e.target.checked)}
            className="w-5 h-5 accent-[#ef4444]"
          />
          Solo pendientes
        </label>
        <button onClick={exportPdf} className="btn-game btn-purple !py-2 !px-4 ml-auto">
          🖨️ PDF
        </button>
      </div>

      <div className="space-y-2">
        {students.map((s) => (
          <div key={s.rut} className="card p-3 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[#27407a] truncate">{s.nombre}</div>
              <div className="text-xs text-[#9aa6bf]">
                {[s.curso, formatRut(s.rut)].filter(Boolean).join(" · ")}
              </div>
            </div>
            <span
              className={`text-xs font-black px-2 py-1 rounded-lg ${
                s.delivered
                  ? "bg-[#eafaf0] text-[#1c7a44]"
                  : "bg-[#fdeaea] text-[#c0392b]"
              }`}
            >
              {s.delivered ? `Entregado${s.fecha ? " · " + s.fecha : ""}` : "Pendiente"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Ajustes -----------------------------------------------------------------

function SettingsSection({
  program,
  onChanged,
  onDeleted,
}: {
  program: Program;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [nombre, setNombre] = useState(program.nombre);
  const [descripcion, setDescripcion] = useState(program.descripcion || "");
  const [requiereMembresia, setRequiereMembresia] = useState(
    program.requiereMembresia
  );
  const [permitirAutoRegistro, setPermitirAutoRegistro] = useState(
    program.permitirAutoRegistro
  );
  const [qrVentanaMin, setQrVentanaMin] = useState(program.qrVentanaMin);
  const [umbral, setUmbral] = useState(program.umbralAsistencia);
  const [clave, setClave] = useState(program.validadorClave);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/programs/${program._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          descripcion,
          requiereMembresia,
          permitirAutoRegistro,
          qrVentanaMin,
          umbralAsistencia: umbral,
          validadorClave: clave,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || d.error || "No se pudo guardar.");
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`¿Eliminar el programa "${program.nombre}"?`)) return;
    const res = await fetch(`/api/programs/${program._id}`, { method: "DELETE" });
    if (res.ok) {
      onChanged();
      onDeleted();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "No se pudo eliminar");
    }
  }

  return (
    <div className="card p-5 space-y-3 max-w-lg">
      <div className="rounded-2xl bg-[#f4f8ff] p-3 text-sm font-semibold text-[#41507a]">
        Tipo:{" "}
        <b>
          {program.modalidad === "temporal"
            ? "🔁 Temporal (asistencia recurrente)"
            : "📍 Puntual (entrega única)"}
        </b>
        <span className="block text-xs text-[#9aa6bf] font-semibold">
          El tipo se define al crear y no se puede cambiar.
        </span>
      </div>
      <div>
        <label className="label-game">Nombre</label>
        <input
          className="input-game"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>
      <div>
        <label className="label-game">Descripción</label>
        <input
          className="input-game"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={requiereMembresia}
          onChange={(e) => setRequiereMembresia(e.target.checked)}
          className="w-6 h-6 accent-[#4f7cff]"
        />
        <span className="font-bold text-[#27407a]">
          Requiere lista de autorizados
        </span>
      </label>
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={permitirAutoRegistro}
          onChange={(e) => setPermitirAutoRegistro(e.target.checked)}
          className="w-6 h-6 accent-[#4f7cff]"
        />
        <span className="font-bold text-[#27407a]">
          Permitir auto-registro por QR
          <span className="block text-xs text-[#6b7aa0] font-semibold">
            El estudiante se marca solo desde su celular. Si está apagado, no habrá
            QR externo: cada coordinador o docente deberá enrolar/registrar.
          </span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-game">Ventana del QR (min)</label>
          <input
            type="number"
            min={0}
            className="input-game"
            value={qrVentanaMin}
            onChange={(e) => setQrVentanaMin(Number(e.target.value))}
            disabled={!permitirAutoRegistro}
          />
          <p className="text-[11px] text-[#9aa6bf] mt-1">0 = siempre abierto</p>
        </div>
        {program.modalidad === "temporal" && (
          <div>
            <label className="label-game">Umbral baja asist. (%)</label>
            <input
              type="number"
              min={1}
              max={100}
              className="input-game"
              value={umbral}
              onChange={(e) => setUmbral(Number(e.target.value))}
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border-2 border-[#eef2ff] p-3 space-y-2">
        <div className="font-black text-[#27407a]">📷 Validador (kiosko)</div>
        <p className="text-xs text-[#6b7aa0] font-semibold">
          En la tablet, entra a la <b>pantalla principal</b> del sitio y escribe
          esta clave en “Validar ingreso” para validar caras de este programa.
        </p>
        <div>
          <label className="label-game">Clave del validador</label>
          <div className="flex gap-2">
            <input
              className="input-game font-mono"
              value={clave}
              onChange={(e) =>
                setClave(e.target.value.toLowerCase().replace(/\s+/g, ""))
              }
              placeholder="ej. almuerzo2026"
            />
            <button
              onClick={() => setClave(claveSugerida(nombre))}
              className="btn-game btn-orange !px-3"
              title="Sugerir clave (nombre + año)"
            >
              ♻️
            </button>
          </div>
          <p className="text-[11px] text-[#9aa6bf] mt-1">
            Guarda para aplicar el cambio de clave.
          </p>
        </div>
      </div>

      {error && (
        <div className="font-bold text-center text-[#ef4444]">{error}</div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={save} disabled={saving} className="btn-game btn-blue flex-1">
          {saving ? "Guardando..." : "Guardar"}
        </button>
        <button onClick={remove} className="btn-game btn-red !px-4">
          🗑️ Eliminar
        </button>
      </div>
    </div>
  );
}
