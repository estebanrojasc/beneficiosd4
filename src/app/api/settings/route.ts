import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

export async function GET() {
  const db = await getDb();
  const settings = await getSettings(db);
  const session = await getSession();
  // Sin sesión solo exponemos la identidad pública (logo y nombre), que se usa
  // en la portada, el login y el favicon. Los umbrales y flags quedan privados.
  if (!session) {
    return NextResponse.json({
      establecimientoNombre: settings.establecimientoNombre,
      logo: settings.logo,
    });
  }
  return NextResponse.json(settings);
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

  const db = await getDb();
  await saveSettings(db, patch);
  const settings = await getSettings(db);
  return NextResponse.json({ ok: true, ...settings });
}
