"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  resolveConsentSections,
  CONSENT_VERSION,
  CHILD_EXPLANATION,
  calculateAge,
  getAutonomyTier,
  type ConsentSection,
} from "@/lib/consent";
import { fullName } from "@/lib/curso";
import { formatRut } from "@/lib/rut";

interface StudentData {
  _id: string;
  nombre: string;
  apellidos?: string;
  curso?: string;
  rut: string;
  fechaNacimiento?: string;
}

export default function AutorizacionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const [student, setStudent] = useState<StudentData | null>(null);
  const [establecimiento, setEstablecimiento] = useState("");
  const [responsable, setResponsable] = useState("");
  const [dpoNombre, setDpoNombre] = useState("");
  const [dpoContacto, setDpoContacto] = useState("");
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [proveedorContacto, setProveedorContacto] = useState("");
  const [override, setOverride] = useState<ConsentSection[]>([]);
  const [logo, setLogo] = useState("");
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const [sRes, cfgRes] = await Promise.all([
        fetch(`/api/students/${id}`, { cache: "no-store" }),
        fetch(`/api/settings`, { cache: "no-store" }),
      ]);
      if (!sRes.ok) {
        setEstado("error");
        return;
      }
      const s = await sRes.json();
      setStudent(s);
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setEstablecimiento(cfg.establecimientoNombre || "");
        setResponsable(cfg.responsableTratamiento || "");
        setDpoNombre(cfg.dpoNombre || "");
        setDpoContacto(cfg.dpoContacto || "");
        setProveedorNombre(cfg.proveedorNombre || "");
        setProveedorContacto(cfg.proveedorContacto || "");
        if (Array.isArray(cfg.consentTextos)) setOverride(cfg.consentTextos);
        setLogo(cfg.logo || "");
      }
      setEstado("ok");
    } catch {
      setEstado("error");
    }
  }, [id]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  if (estado === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-xl font-bold text-[#5b6b94] animate-pulse">
          Cargando…
        </p>
      </main>
    );
  }

  if (estado === "error" || !student) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <p className="text-xl font-bold text-[#ef4444]">
          No se pudo cargar el estudiante. Vuelve a intentarlo desde el panel.
        </p>
      </main>
    );
  }

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
  const titular = fullName(student.nombre, student.apellidos);
  const age = student.fechaNacimiento ? calculateAge(student.fechaNacimiento) : 0;
  const autonomyTier = student.fechaNacimiento
    ? getAutonomyTier(age)
    : "tutela";

  return (
    <main className="min-h-screen bg-white text-[#1f2a44]">
      {/* Barra de acciones: no se imprime. */}
      <div className="print:hidden sticky top-0 bg-[#f6f8ff] border-b border-[#e1e8f7] px-4 py-3 flex items-center justify-between gap-3">
        <span className="font-bold text-[#41507a] text-sm">
          Documento de autorización — revísalo e imprímelo para la firma.
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="btn-game btn-blue !py-2 !px-4 !text-sm"
          >
            🖨️ Imprimir
          </button>
          <button
            onClick={() => window.close()}
            className="btn-game btn-gray !py-2 !px-4 !text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-8 py-8 leading-relaxed">
        <header className="flex items-center gap-4 border-b-2 border-[#1f2a44] pb-4 mb-6">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo" className="w-16 h-16 object-contain" />
          ) : null}
          <div>
            <h1 className="text-xl font-black">
              {establecimiento || "Establecimiento educacional"}
            </h1>
            <p className="text-sm text-[#5b6b94]">
              Autorización para el tratamiento de datos biométricos
            </p>
          </div>
        </header>

        <p className="mb-4 text-sm">
          {autonomyTier === "plena" ? (
            <>
              En cumplimiento de la Ley N° 21.719 sobre Protección de Datos
              Personales y la Ley N° 21.430 de Garantías de la Niñez, se
              solicita al estudiante mayor de 16 años su consentimiento expreso,
              específico e informado para el tratamiento de sus datos biométricos
              (reconocimiento facial) descrito a continuación.
            </>
          ) : (
            <>
              En cumplimiento de la Ley N° 21.719 sobre Protección de Datos
              Personales, se solicita al apoderado o representante legal del
              estudiante su autorización expresa, específica e informada para el
              tratamiento de los datos biométricos (reconocimiento facial)
              descrito a continuación.
            </>
          )}
        </p>

        {/* Datos del estudiante */}
        <section className="mb-6 rounded-lg border border-[#cdd6ee] p-4 text-sm">
          <h2 className="font-black mb-2">Datos del estudiante</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            <div>
              <strong>Nombre:</strong> {titular}
            </div>
            <div>
              <strong>RUT:</strong> {formatRut(student.rut)}
            </div>
            <div>
              <strong>Curso:</strong> {student.curso || "—"}
            </div>
            {student.fechaNacimiento && (
              <div>
                <strong>Edad:</strong> {age} años
              </div>
            )}
          </div>
        </section>

        {/* Explicación adaptada para el estudiante */}
        <section className="mb-6 rounded-xl border-2 border-sky-200 bg-sky-50 p-4 text-sm">
          <h2 className="font-black text-sky-900 mb-3">
            📘 Explicación para el estudiante (lenguaje claro)
          </h2>
          <p className="text-sky-800 mb-3 text-xs">
            Este apartado debe leerse con el estudiante antes de firmar. Está
            redactado en lenguaje comprensible conforme a la Ley N° 21.430.
          </p>
          <div className="space-y-3">
            {CHILD_EXPLANATION.map((item) => (
              <div key={item.pregunta}>
                <h3 className="font-black text-sky-900">{item.pregunta}</h3>
                <p className="mt-0.5 text-sky-800">{item.respuesta}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Texto informativo del tratamiento */}
        <section className="text-sm space-y-4 mb-6">
          {sections.map((sec) => (
            <div key={sec.titulo}>
              <h3 className="font-black">{sec.titulo}</h3>
              {sec.parrafos.map((p, i) => (
                <p key={i} className="mt-1 text-justify">
                  {p}
                </p>
              ))}
            </div>
          ))}
        </section>

        {/* Declaración y firma */}
        <section className="text-sm mb-8">
          {autonomyTier === "plena" ? (
            <>
              <h3 className="font-black mb-2">
                Declaración del estudiante (consentimiento autónomo)
              </h3>
              <p className="text-justify mb-6">
                Declaro haber leído y comprendido la información anterior y{" "}
                <strong>CONSIENTO</strong> de forma libre, específica e informada
                el tratamiento de mi descriptor facial, con la finalidad
                indicada. Entiendo que puedo revocar este consentimiento en
                cualquier momento.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8 mt-10">
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Nombre del estudiante
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    RUT del estudiante
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Fecha
                  </div>
                </div>
                <div className="sm:col-span-2 mt-6">
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Firma del estudiante
                  </div>
                </div>
              </div>
            </>
          ) : autonomyTier === "progresiva" ? (
            <>
              <h3 className="font-black mb-2">Declaración del apoderado</h3>
              <p className="text-justify mb-4">
                Declaro haber leído y comprendido la información anterior,
                habiéndola explicado al adolescente en términos adecuados a su
                edad y madurez, y <strong>AUTORIZO</strong> de forma libre,
                específica e informada el tratamiento del descriptor facial del
                estudiante individualizado. Entiendo que puedo revocar esta
                autorización en cualquier momento.
              </p>
              <h3 className="font-black mb-2 mt-6">
                Asentimiento del adolescente (14-15 años)
              </h3>
              <p className="text-justify mb-6">
                He leído la explicación en lenguaje claro y{" "}
                <strong>DOY MI ASENTIMIENTO</strong> para el uso de mi rostro en
                el sistema de almuerzo escolar.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8 mt-10">
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Nombre del apoderado
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    RUT del apoderado
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Parentesco
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Fecha (apoderado)
                  </div>
                </div>
                <div className="sm:col-span-2 mt-6">
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Firma del apoderado
                  </div>
                </div>
                <div className="sm:col-span-2 mt-8">
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Firma de co-asentimiento del adolescente
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-black mb-2">Declaración del apoderado</h3>
              <p className="text-justify mb-6">
                Declaro haber leído y comprendido la información anterior,
                habiéndola explicado al estudiante en términos adecuados a su
                edad y madurez, y <strong>AUTORIZO</strong> de forma libre,
                específica e informada el tratamiento del descriptor facial del
                estudiante individualizado, con la finalidad indicada. Entiendo
                que puedo revocar esta autorización en cualquier momento.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8 mt-10">
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Nombre del apoderado
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    RUT del apoderado
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Parentesco
                  </div>
                </div>
                <div>
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Fecha
                  </div>
                </div>
                <div className="sm:col-span-2 mt-6">
                  <div className="border-t border-[#1f2a44] pt-1 text-xs">
                    Firma del apoderado
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <footer className="text-[10px] text-[#9aa6bf] border-t border-[#e1e8f7] pt-2">
          Versión del documento: {CONSENT_VERSION}. Conserve una copia firmada en
          el establecimiento.
        </footer>
      </article>
    </main>
  );
}
