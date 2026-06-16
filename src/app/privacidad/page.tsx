"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  resolveConsentSections,
  CONSENT_VERSION,
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
        <p className="text-sm text-[#6b7aa0] font-semibold mb-6">
          {establecimiento || "Establecimiento educacional"} · Conforme a la Ley
          N° 21.719
        </p>

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
