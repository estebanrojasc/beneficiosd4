"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatRut } from "@/lib/rut";

interface AuditLog {
  _id: string;
  action: string;
  actor: string;
  actorType: string;
  rut?: string;
  studentId?: string;
  detail?: string;
  ip?: string;
  at: string;
  verificationHash: string;
}

interface Settings {
  establecimientoNombre: string;
  responsableTratamiento?: string;
  dpoNombre?: string;
  dpoContacto?: string;
}

export default function CertificadoEliminacionPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const [log, setLog] = useState<AuditLog | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [estado, setEstado] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/audit/${id}`, { cache: "no-store" });
      if (!res.ok) {
        setEstado("error");
        return;
      }
      const data = await res.json();
      setLog(data.log);
      setSettings(data.settings);
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
      <main className="min-h-screen flex items-center justify-center bg-[#f6f8ff]">
        <p className="text-xl font-bold text-[#5b6b94] animate-pulse">
          Generando certificado…
        </p>
      </main>
    );
  }

  if (estado === "error" || !log || !settings) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#fdeaea] px-4">
        <p className="text-xl font-bold text-[#ef4444] text-center">
          No se pudo cargar el registro de eliminación. Asegúrate de tener los permisos necesarios.
        </p>
      </main>
    );
  }

  const actionLabels: Record<string, string> = {
    "consent.revoke": "Revocación de consentimiento del apoderado",
    "student.delete": "Supresión / Eliminación voluntaria del estudiante",
    "retention.purge": "Purga por política de retención de datos",
  };

  const actionText = actionLabels[log.action] || log.action;
  const formattedDate = new Date(log.at).toLocaleString("es-CL", {
    dateStyle: "long",
    timeStyle: "medium",
  });

  return (
    <main className="min-h-screen bg-gray-50 text-slate-800 p-4 sm:p-8">
      {/* Barra de acciones: no se imprime */}
      <div className="print:hidden max-w-3xl mx-auto mb-6 bg-white border border-[#e1e8f7] rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <span className="font-semibold text-slate-600 text-sm">
          Documento oficial de supresión de datos biométricos.
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-[#4f7cff] hover:bg-[#3b66df] text-white font-bold py-1.5 px-4 rounded-xl text-sm transition cursor-pointer"
          >
            🖨️ Imprimir Acta
          </button>
          <button
            onClick={() => window.close()}
            className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1.5 px-4 rounded-xl text-sm transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>

      <article className="max-w-3xl mx-auto bg-white border border-slate-200 shadow-md p-8 sm:p-12 relative overflow-hidden print:border-0 print:shadow-none print:p-0">
        {/* Marca de agua / decoración de borde */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        {/* Encabezado */}
        <header className="mb-8 border-b-2 border-slate-900 pb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold text-slate-900 uppercase tracking-wide">
                {settings.establecimientoNombre || "Establecimiento Educacional"}
              </h1>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1">
                Certificación de Cumplimiento de Protección de Datos Personales
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2.5 py-1 rounded border border-slate-200 uppercase">
                ISO 27001 · Control A.8.10
              </span>
            </div>
          </div>
        </header>

        {/* Título Principal */}
        <section className="text-center my-8">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            ACTA DE ELIMINACIÓN Y SUPRESIÓN DE DATOS BIOMÉTRICOS
          </h2>
          <p className="text-sm text-slate-500 mt-2 font-medium">
            Emitido en conformidad con la Ley N° 21.719 de Protección de Datos Personales y el Control A.8.10 (ISO/IEC 27001:2022)
          </p>
        </section>

        {/* Declaración */}
        <section className="text-sm leading-relaxed text-justify space-y-4 mb-8">
          <p>
            El Encargado de Protección de Datos (DPO) de <strong>{settings.establecimientoNombre}</strong> certifica que, en cumplimiento de los derechos de los titulares y el principio de minimización y limitación del plazo de conservación de datos, se ha ejecutado el proceso de <strong>eliminación irreversible y definitiva</strong> de la información biométrica del estudiante individualizado a continuación.
          </p>
        </section>

        {/* Detalles del Titular */}
        <section className="bg-slate-50 rounded-xl border border-slate-200 p-5 mb-8 text-sm">
          <h3 className="font-bold text-slate-900 mb-3 border-b border-slate-200 pb-1.5 uppercase tracking-wide text-xs">
            Detalles del Titular de los Datos
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-slate-500 text-xs block">Identificador del Estudiante (RUT):</span>
              <strong className="text-slate-900 font-semibold">{log.rut ? formatRut(log.rut) : "—"}</strong>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">ID Interno del Registro:</span>
              <strong className="text-slate-900 font-mono text-xs break-all">{log.studentId || "—"}</strong>
            </div>
          </div>
        </section>

        {/* Detalles Técnicos de la Supresión */}
        <section className="bg-slate-50 rounded-xl border border-slate-200 p-5 mb-8 text-sm">
          <h3 className="font-bold text-slate-900 mb-3 border-b border-slate-200 pb-1.5 uppercase tracking-wide text-xs">
            Detalles Técnicos del Proceso de Borrado
          </h3>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 text-xs block">Causa de la Devolución/Borrado:</span>
                <span className="font-semibold text-slate-900">{actionText}</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Fecha y Hora de la Supresión:</span>
                <span className="font-semibold text-slate-900">{formattedDate}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 text-xs block">Ejecutor del Borrado:</span>
                <span className="font-semibold text-slate-900">{log.actor} ({log.actorType})</span>
              </div>
              <div>
                <span className="text-slate-500 text-xs block">Dirección IP de Solicitud:</span>
                <span className="font-mono text-slate-900 text-xs">{log.ip || "—"}</span>
              </div>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Detalle de la Acción:</span>
              <p className="text-slate-700 italic">{log.detail || "Borrado lógico definitivo."}</p>
            </div>
            <div>
              <span className="text-slate-500 text-xs block">Método de Destrucción Seguro:</span>
              <p className="text-slate-600 text-xs">
                Sobreescritura del vector de características faciales (512 dimensiones) a valor nulo (`null`) en la base de datos central NoSQL, inhabilitación inmediata del estado de enrolamiento y comandos automáticos de sincronización e invalidación de caché local (IndexedDB) en todas las tablets/kioskos autorizados en un plazo máximo de 24 horas.
              </p>
            </div>
          </div>
        </section>

        {/* Garantía e Integridad Criptográfica */}
        <section className="border-t border-b border-slate-200 py-4 mb-8 text-xs text-slate-600 bg-slate-50 p-4 rounded-xl">
          <h4 className="font-bold text-slate-900 mb-1">Garantía de Integridad del Log (Estándar ISO 27001):</h4>
          <p className="mb-2.5">
            Este certificado está respaldado por el sistema de auditoría del establecimiento. El siguiente hash criptográfico SHA-256 valida la existencia y no-modificación de este evento de borrado en el log histórico.
          </p>
          <div className="font-mono bg-white p-2 rounded border border-slate-300 select-all break-all text-slate-800 text-[10px] sm:text-xs">
            {log.verificationHash}
          </div>
        </section>

        {/* Responsables y Firmas */}
        <section className="mt-12 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-12">
            <div className="text-center pt-8 border-t border-slate-300">
              <span className="text-xs text-slate-500 block">Responsable del Tratamiento:</span>
              <strong className="text-slate-800 block text-xs">{settings.responsableTratamiento || settings.establecimientoNombre}</strong>
              <div className="h-6"></div>
              <div className="text-[10px] text-slate-400">Representante Legal</div>
            </div>
            <div className="text-center pt-8 border-t border-slate-300">
              <span className="text-xs text-slate-500 block">Encargado de Protección de Datos (DPO):</span>
              <strong className="text-slate-800 block text-xs">{settings.dpoNombre || "DPO Oficial"}</strong>
              {settings.dpoContacto && <span className="text-[10px] text-slate-500 block font-mono">{settings.dpoContacto}</span>}
              <div className="h-6"></div>
              <div className="text-[10px] text-slate-400">Firma DPO / Autoridad de Control Interna</div>
            </div>
          </div>
        </section>

        {/* Pie de página oficial */}
        <footer className="mt-12 pt-4 border-t border-slate-100 text-[9px] text-slate-400 text-center">
          Código único del evento de auditoría: {log._id} · Este documento constituye prueba fidedigna del cumplimiento del derecho de supresión biométrica. Establecimiento Educacional {settings.establecimientoNombre}.
        </footer>
      </article>
    </main>
  );
}
