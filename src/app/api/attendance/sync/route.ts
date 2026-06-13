import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { normalizeRut } from "@/lib/rut";

function authorized(req: NextRequest, session: unknown): boolean {
  if (session) return true;
  const token =
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    "";
  return token === (process.env.KIOSK_TOKEN || "kiosko2026");
}

interface QueuedRecord {
  rut: string;
  nombre?: string;
  curso?: string;
  method?: "facial" | "manual";
  timestamp?: string;
  fecha?: string; // YYYY-MM-DD
}

// Recibe registros acumulados offline y los inserta evitando duplicados por día.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!authorized(req, session))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const records: QueuedRecord[] = Array.isArray(body.records)
    ? body.records
    : [];

  const db = await getDb();
  let inserted = 0;
  let duplicates = 0;

  for (const r of records) {
    if (!r.rut) continue;
    const norm = normalizeRut(r.rut);
    const fecha = r.fecha || (r.timestamp || new Date().toISOString()).slice(0, 10);

    const exists = await db
      .collection("attendance")
      .findOne({ fecha, "records.rut": norm });
    if (exists) {
      duplicates++;
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = {
      $setOnInsert: { fecha, createdAt: new Date().toISOString() },
      $set: { updatedAt: new Date().toISOString() },
      $push: {
        records: {
          rut: norm,
          nombre: r.nombre || "",
          curso: r.curso || "",
          method: r.method === "manual" ? "manual" : "facial",
          timestamp: r.timestamp || new Date().toISOString(),
        },
      },
    };
    await db.collection("attendance").updateOne({ fecha }, update, { upsert: true });
    inserted++;
  }

  return NextResponse.json({ ok: true, inserted, duplicates });
}
