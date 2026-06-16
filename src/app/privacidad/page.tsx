"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  resolveConsentSections,
  CONSENT_VERSION,
  CHILD_EXPLANATION,
  type ConsentSection,
} from "@/lib/consent";

export default function PrivacidadPage() {
  const [establecimiento, setEstablecimiento] = useState("");
  const [responsable, setResponsable] = useState("");
  const [dpoNombre, setDpoNombre] = useState("");
  const [dpoContacto, setDpoContacto] = useState("");
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [proveedorContacto, setProveedorContacto] = useState("");
  const [override, setOverride] = useState<ConsentSection[]>([]);
  const [modoInfantil, setModoInfantil] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.establecimientoNombre === "string")
          setEstablecimiento(d.establecimientoNombre);
        if (typeof d?.responsableTratamiento === "string")
          setResponsable(d.responsableTratamiento);
        if (typeof d?.dpoNombre === "string") setDpoNombre(d.dpoNombre);
        if (typeof d?.dpoContacto === "string") setDpoContacto(d.dpoContacto);
        if (typeof d?.proveedorNombre === "string")
          setProveedorNombre(d.proveedorNombre);
        if (typeof d?.proveedorContacto === "string")
          setProveedorContacto(d.proveedorContacto);
        if (Array.isArray(d?.consentTextos)) setOverride(d.consentTextos);
      })
      .catch(() => {});
  }, []);

  const sections = resolveConsentSections(
    {
      establecimiento,
      responsable,
      dpoNombre,
      dpoContacto,
      proveedorNombre,
      proveedorContacto,
    },
    override
  );

  return (
    <main className="min-h-screen px-4 py-8">
      <article className="max-w-2xl mx-auto card p-6 sm:p-8">
        <h1 className="text-2xl font-black text-[#27407a] mb-1">
          Política de tratamiento de datos personales
        </h1>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          {establecimiento || "Establecimiento educacional"} · Conforme a la Ley
          N° 21.719
        </p>

        <div className="mb-6 rounded-xl border-2 border-[#e1e8f7] bg-[#f6f8ff] p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="text-sm font-bold text-[#41507a]">
            {modoInfantil
              ? "Versión para estudiantes (lenguaje claro)"
              : "Política oficial (lenguaje legal)"}
          </span>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs font-semibold text-[#6b7aa0]">
              Lenguaje claro
            </span>
            <input
              type="checkbox"
              checked={modoInfantil}
              onChange={(e) => setModoInfantil(e.target.checked)}
              className="w-5 h-5 accent-[#4f7cff]"
            />
          </label>
        </div>

        {modoInfantil ? (
          <div className="space-y-5">
            <p className="text-sm text-[#5b6b94] font-medium">
              Hola 👋 Esta es la explicación de cómo usamos tu rostro en el
              almuerzo escolar. Está escrita para que la entiendas fácilmente.
            </p>
            {CHILD_EXPLANATION.map((item) => (
              <section key={item.pregunta}>
                <h2 className="font-black text-[#41507a]">{item.pregunta}</h2>
                <p className="mt-1 text-sm text-[#5b6b94] font-medium text-justify">
                  {item.respuesta}
                </p>
              </section>
            ))}
            {dpoNombre && (
              <section>
                <h2 className="font-black text-[#41507a]">
                  📞 ¿Tienes dudas?
                </h2>
                <p className="mt-1 text-sm text-[#5b6b94] font-medium">
                  Puedes hablar con {dpoNombre}
                  {dpoContacto ? ` (${dpoContacto})` : ""} o con un adulto de
                  confianza en el colegio.
                </p>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map((sec) => (
              <section key={sec.titulo}>
                <h2 className="font-black text-[#41507a]">{sec.titulo}</h2>
                {sec.parrafos.map((p, i) => (
                  <p
                    key={i}
                    className="mt-1 text-sm text-[#5b6b94] font-medium text-justify"
                  >
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[#9aa6bf] mt-8 border-t border-[#eef2ff] pt-3">
          Versión del documento: {CONSENT_VERSION}.
        </p>

        <Link
          href="/"
          className="block text-center mt-6 font-bold text-[#6b7aa0]"
        >
          ← Volver al inicio
        </Link>
      </article>
    </main>
  );
}
