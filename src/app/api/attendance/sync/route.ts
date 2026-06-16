import { NextRequest, NextResponse } from "next/server";
import { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { normalizeRut } from "@/lib/rut";
import { dateInTZ } from "@/lib/date";
import { isKioskTokenValid } from "@/lib/programs";

async function authorized(
  req: NextRequest,
  session: unknown,
  db: Db
): Promise<boolean> {
  if (session) return true;
  const token =
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    "";
  return isKioskTokenValid(db, token);
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
  const db = await getDb();
  if (!(await authorized(req, session, db)))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const records: QueuedRecord[] = Array.isArray(body.records)
    ? body.records
    : [];

  let inserted = 0;
  let duplicates = 0;

  for (const r of records) {
    if (!r.rut) continue;
    const norm = normalizeRut(r.rut);
    const fecha =
      r.fecha || dateInTZ(r.timestamp ? new Date(r.timestamp) : new Date());

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
