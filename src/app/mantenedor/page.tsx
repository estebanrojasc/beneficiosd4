"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import StudentsTab from "@/components/mantenedor/StudentsTab";
import CursosTab from "@/components/mantenedor/CursosTab";
import RutsTab from "@/components/mantenedor/RutsTab";
import QRTab from "@/components/mantenedor/QRTab";
import AttendanceTab from "@/components/mantenedor/AttendanceTab";

type Tab = "estudiantes" | "cursos" | "ruts" | "qr" | "asistencia";

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: "estudiantes", label: "Estudiantes", emoji: "🧒" },
  { id: "cursos", label: "Cursos", emoji: "🏫" },
  { id: "ruts", label: "Lista almuerzo", emoji: "📋" },
  { id: "qr", label: "QR enrolar", emoji: "🔳" },
  { id: "asistencia", label: "Asistencia", emoji: "🍽️" },
];

export default function MantenedorPage() {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("estudiantes");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => {
        if (r.ok) setAuthed(true);
        else {
          setAuthed(false);
          router.replace("/login");
        }
      })
      .catch(() => {
        setAuthed(false);
        router.replace("/login");
      });
  }, [router]);

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

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b-2 border-[#eef2ff] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍽️</span>
          <h1 className="text-xl font-black text-[#27407a]">Mantenedor</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/validar" className="btn-game btn-green !py-2 !px-4 !text-base">
            📷 Validar
          </Link>
          <button onClick={logout} className="btn-game btn-gray !py-2 !px-4 !text-base">
            Salir
          </button>
        </div>
      </header>

      {/* Pestañas */}
      <nav className="px-3 py-3 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-2xl px-4 py-2 font-extrabold transition ${
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
        {tab === "estudiantes" && <StudentsTab />}
        {tab === "cursos" && <CursosTab />}
        {tab === "ruts" && <RutsTab />}
        {tab === "qr" && <QRTab />}
        {tab === "asistencia" && <AttendanceTab />}
      </section>
    </main>
  );
}
