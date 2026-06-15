import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const settings = await getSettings(db);
  const session = await getSession();
  const hasLogo = Boolean(settings.logo);
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
    return NextResponse.json({
      establecimientoNombre: settings.establecimientoNombre,
      hasLogo,
    });
  }
  return NextResponse.json({ ...settings, hasLogo });
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
