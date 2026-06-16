import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession, getSessionWithCap } from "@/lib/auth";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

// Datos del proveedor (Encargado del Tratamiento) que actúa junto al
// establecimiento. Vienen del entorno (no se editan desde la app).
function proveedorFromEnv() {
  return {
    proveedorNombre: process.env.PROVEEDOR_NOMBRE || "",
    proveedorContacto: process.env.PROVEEDOR_CONTACTO || "",
  };
}

export async function GET(req: NextRequest) {
  const db = await getDb();
  const settings = await getSettings(db);
  const session = await getSession();
  const hasLogo = Boolean(settings.logo);
  const proveedor = proveedorFromEnv();
  const light = req.nextUrl.searchParams.get("light") === "1";
  if (light) {
    return NextResponse.json({
      enrolamientoAbierto: settings.enrolamientoAbierto,
      umbralAsistencia: settings.umbralAsistencia,
      umbralCaraDuplicada: settings.umbralCaraDuplicada,
      establecimientoNombre: settings.establecimientoNombre,
      hasLogo,
    });
  }
  // Sin sesión solo exponemos lo público: nombre y si hay logo (NO el base64,
  // que es pesado). El logo se sirve aparte como imagen en /api/branding/logo.
  if (!session) {
    // Datos públicos para la política de privacidad y el documento de
    // autorización: nombre, responsable y contacto del DPO.
    return NextResponse.json({
      establecimientoNombre: settings.establecimientoNombre,
      responsableTratamiento: settings.responsableTratamiento,
      dpoNombre: settings.dpoNombre,
      dpoContacto: settings.dpoContacto,
      consentTextos: settings.consentTextos,
      ...proveedor,
      hasLogo,
    });
  }
  return NextResponse.json({ ...settings, ...proveedor, hasLogo });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Partial<AppSettings> = {};

  if (body.enrolamientoAbierto !== undefined) {
    patch.enrolamientoAbierto = Boolean(body.enrolamientoAbierto);
  }
  if (body.umbralAsistencia !== undefined) {
    patch.umbralAsistencia = Number(body.umbralAsistencia);
  }
  if (body.umbralCaraDuplicada !== undefined) {
    patch.umbralCaraDuplicada = Number(body.umbralCaraDuplicada);
  }
  if (body.establecimientoNombre !== undefined) {
    patch.establecimientoNombre = String(body.establecimientoNombre);
  }
  if (body.logo !== undefined) {
    patch.logo = String(body.logo);
  }
  if (body.responsableTratamiento !== undefined) {
    patch.responsableTratamiento = String(body.responsableTratamiento);
  }
  if (body.dpoNombre !== undefined) {
    patch.dpoNombre = String(body.dpoNombre);
  }
  if (body.dpoContacto !== undefined) {
    patch.dpoContacto = String(body.dpoContacto);
  }
  if (body.retencionMeses !== undefined) {
    patch.retencionMeses = Number(body.retencionMeses);
  }
  if (body.retencionPurgaAnioAnterior !== undefined) {
    patch.retencionPurgaAnioAnterior = Boolean(body.retencionPurgaAnioAnterior);
  }
  // Editar el texto legal requiere el permiso específico (por defecto, solo admin).
  if (body.consentTextos !== undefined) {
    const canEdit = await getSessionWithCap("textosLegales");
    if (!canEdit)
      return NextResponse.json(
        { error: "No autorizado para editar textos legales" },
        { status: 403 }
      );
    patch.consentTextos = Array.isArray(body.consentTextos)
      ? body.consentTextos
      : [];
  }

  const db = await getDb();
  await saveSettings(db, patch);
  const settings = await getSettings(db);
  return NextResponse.json({ ok: true, ...settings });
}
