import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

export async function GET() {
  const db = await getDb();
  const settings = await getSettings(db);
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

  const db = await getDb();
  await saveSettings(db, patch);
  const settings = await getSettings(db);
  return NextResponse.json({ ok: true, ...settings });
}
