import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { normalizeRut } from "@/lib/rut";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function authorized(req: NextRequest, session: unknown): boolean {
  if (session) return true;
  const token =
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    "";
  return token === (process.env.KIOSK_TOKEN || "kiosko2026");
}

// Marca asistencia al almuerzo. Evita duplicados por RUT en el mismo día.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!authorized(req, session))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { rut, nombre, curso, method, timestamp } = body as {
    rut?: string;
    nombre?: string;
    curso?: string;
    method?: "facial" | "manual";
    timestamp?: string;
  };

  if (!rut)
    return NextResponse.json({ error: "Falta el RUT" }, { status: 400 });

  const db = await getDb();
  const fecha = today();
  const norm = normalizeRut(rut);

  // ¿Ya marcó hoy?
  const existing = await db.collection("attendance").findOne({
    fecha,
    "records.rut": norm,
  });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const record = {
    rut: norm,
    nombre: nombre || "",
    curso: curso || "",
    method: method === "manual" ? "manual" : "facial",
    timestamp: timestamp || new Date().toISOString(),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = {
    $setOnInsert: { fecha, createdAt: new Date().toISOString() },
    $set: { updatedAt: new Date().toISOString() },
    $push: { records: record },
  };
  await db.collection("attendance").updateOne({ fecha }, update, { upsert: true });

  return NextResponse.json({ ok: true });
}

// Lista la asistencia de un día (por defecto hoy).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!authorized(req, session))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const fecha = req.nextUrl.searchParams.get("fecha") || today();
  const db = await getDb();
  const day = await db.collection("attendance").findOne({ fecha });

  return NextResponse.json({
    fecha,
    records: day?.records || [],
    total: day?.records?.length || 0,
  });
}
