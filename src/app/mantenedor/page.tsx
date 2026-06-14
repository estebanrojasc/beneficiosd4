"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StudentsTab from "@/components/mantenedor/StudentsTab";
import CursosTab from "@/components/mantenedor/CursosTab";
import QRTab from "@/components/mantenedor/QRTab";
import AjustesTab from "@/components/mantenedor/AjustesTab";
import ProgramasTab from "@/components/mantenedor/ProgramasTab";
import UsuariosTab from "@/components/mantenedor/UsuariosTab";
import RolesTab from "@/components/mantenedor/RolesTab";
import type { CapKey, RoleCaps } from "@/lib/types";

type Section = "operacion" | "gestion";
type Tab =
  | "operar"
  | "programas"
  | "enrolar"
  | "estudiantes"
  | "cursos"
  | "ajustes"
  | "usuarios"
  | "roles";

interface TabDef {
  id: Tab;
  label: string;
  emoji: string;
  // Capacidad/permiso requerido para ver la pestaña.
  cap: CapKey;
}

// Operación: elegir un programa y operarlo (validar, lista, reportes).
const OPERACION_TABS: TabDef[] = [
  { id: "operar", label: "Programas", emoji: "🗂️", cap: "operacion" },
];

// Gestión: configuración de fondo (programas, estudiantes, cursos, usuarios).
const GESTION_TABS: TabDef[] = [
  { id: "programas", label: "Programas", emoji: "🗂️", cap: "programas" },
  { id: "enrolar", label: "Enrolar (QR)", emoji: "🔳", cap: "enrolar" },
  { id: "estudiantes", label: "Estudiantes", emoji: "🧒", cap: "estudiantes" },
  { id: "cursos", label: "Cursos", emoji: "🏫", cap: "cursos" },
  { id: "usuarios", label: "Usuarios", emoji: "👥", cap: "usuarios" },
  { id: "roles", label: "Roles", emoji: "🛡️", cap: "usuarios" },
  { id: "ajustes", label: "Ajustes", emoji: "⚙️", cap: "ajustes" },
];

const ALL_TABS: Tab[] = [
  "operar",
  "programas",
  "enrolar",
  "estudiantes",
  "cursos",
  "ajustes",
  "usuarios",
  "roles",
];

const STORAGE_KEY = "mantenedor:nav";

// Lee la última sección/pestaña usada (para volver al mismo lugar tras Validar).
function getInitialNav(): { section: Section; tab: Tab } {
  const fallback: { section: Section; tab: Tab } = {
    section: "operacion",
    tab: "operar",
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { section?: Section; tab?: Tab };
      // Validamos contra las pestañas actuales (descarta valores antiguos).
      if (
        (saved.section === "operacion" || saved.section === "gestion") &&
        saved.tab &&
        ALL_TABS.includes(saved.tab)
      )
        return { section: saved.section, tab: saved.tab };
    }
  } catch {
    // Ignoramos errores de almacenamiento.
  }
  return fallback;
}

export default function MantenedorPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [caps, setCaps] = useState<RoleCaps | null>(null);
  const [section, setSection] = useState<Section>(() => getInitialNav().section);
  const [tab, setTab] = useState<Tab>(() => getInitialNav().tab);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (r) => {
        if (!r.ok) {
          setAuthed(false);
          router.replace("/login");
          return;
        }
        const data = await r.json();
        // Si tiene clave temporal, lo mandamos a cambiarla antes de entrar.
        if (data.mustChangePassword) {
          router.replace("/cambiar-clave");
          return;
        }
        setCaps((data.caps as RoleCaps) ?? null);
        setAuthed(true);
      })
      .catch(() => {
        setAuthed(false);
        router.replace("/login");
      });
  }, [router]);

  // Recordamos sección y pestaña para volver al mismo lugar (p. ej. tras Validar).
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ section, tab }));
    } catch {
      // Ignoramos errores de almacenamiento.
    }
  }, [section, tab]);

  // Si la pestaña actual no está permitida por los permisos, saltamos a la
  // primera pestaña visible (evita quedar en una sección sin contenido).
  useEffect(() => {
    if (!caps) return;
    const fix = () => {
      const defs = section === "operacion" ? OPERACION_TABS : GESTION_TABS;
      const allowed = defs.filter((t) => caps[t.cap]);
      if (allowed.length === 0) {
        const other = section === "operacion" ? "gestion" : "operacion";
        const otherDefs = other === "operacion" ? OPERACION_TABS : GESTION_TABS;
        const otherAllowed = otherDefs.filter((t) => caps[t.cap]);
        if (otherAllowed.length > 0) {
          setSection(other);
          setTab(otherAllowed[0].id);
        }
        return;
      }
      if (!allowed.some((t) => t.id === tab)) setTab(allowed[0].id);
    };
    const t = window.setTimeout(fix, 0);
    return () => window.clearTimeout(t);
  }, [caps, section, tab]);

  function switchSection(next: Section) {
    setSection(next);
    const defs = next === "operacion" ? OPERACION_TABS : GESTION_TABS;
    const allowed = defs.filter((t) => !caps || caps[t.cap]);
    setTab(allowed[0]?.id ?? (next === "operacion" ? "operar" : "programas"));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (authed === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-2xl font-bold text-[#5b6b94] animate-pulse">
          Cargando...
        </div>
      </main>
    );
  }
  if (!authed) return null;

  const visible = (defs: TabDef[]) =>
    defs.filter((t) => caps?.[t.cap]);
  const tabs = visible(section === "operacion" ? OPERACION_TABS : GESTION_TABS);

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b-2 border-[#eef2ff] px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl">🍽️</span>
          <h1 className="text-xl font-black text-[#27407a] truncate">
            Mantenedor
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Selector de sección compacto, dentro de la barra superior. */}
          <div className="hidden sm:inline-flex rounded-xl bg-[#eef2ff] p-1 gap-1">
            <button
              onClick={() => switchSection("operacion")}
              title="Operación"
              className={`rounded-lg px-3 py-1.5 font-extrabold text-sm transition ${
                section === "operacion"
                  ? "bg-white text-[#27407a] shadow"
                  : "text-[#6b7aa0]"
              }`}
            >
              🍽️ Operación
            </button>
            <button
              onClick={() => switchSection("gestion")}
              title="Gestión"
              className={`rounded-lg px-3 py-1.5 font-extrabold text-sm transition ${
                section === "gestion"
                  ? "bg-white text-[#27407a] shadow"
                  : "text-[#6b7aa0]"
              }`}
            >
              🛠️ Gestión
            </button>
          </div>
          <button
            onClick={logout}
            className="btn-game btn-gray !py-2 !px-3 !text-base"
          >
            Salir
          </button>
        </div>
      </header>

      {/* En móvil, el selector de sección va junto a las pestañas (una sola fila). */}
      <nav className="px-3 py-2 flex gap-2 overflow-x-auto items-center">
        <div className="sm:hidden inline-flex rounded-xl bg-[#eef2ff] p-1 gap-1 shrink-0">
          <button
            onClick={() => switchSection("operacion")}
            className={`rounded-lg px-2.5 py-1.5 font-extrabold text-sm transition ${
              section === "operacion"
                ? "bg-white text-[#27407a] shadow"
                : "text-[#6b7aa0]"
            }`}
          >
            🍽️
          </button>
          <button
            onClick={() => switchSection("gestion")}
            className={`rounded-lg px-2.5 py-1.5 font-extrabold text-sm transition ${
              section === "gestion"
                ? "bg-white text-[#27407a] shadow"
                : "text-[#6b7aa0]"
            }`}
          >
            🛠️
          </button>
        </div>
        <span className="sm:hidden w-px h-7 bg-[#e1e8f7] shrink-0" />
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-2xl px-4 py-2 font-extrabold transition shrink-0 ${
              tab === t.id
                ? "bg-[#4f7cff] text-white shadow-lg"
                : "bg-white text-[#41507a] border-2 border-[#eef2ff]"
            }`}
          >
            <span className="mr-1">{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <section className="px-3 pb-16 max-w-5xl mx-auto">
        {tab === "operar" && <ProgramasTab mode="operacion" />}
        {tab === "programas" && <ProgramasTab mode="gestion" />}
        {tab === "enrolar" && <QRTab />}
        {tab === "estudiantes" && <StudentsTab />}
        {tab === "cursos" && <CursosTab />}
        {tab === "usuarios" && <UsuariosTab />}
        {tab === "roles" && <RolesTab />}
        {tab === "ajustes" && <AjustesTab />}
      </section>
    </main>
  );
}
