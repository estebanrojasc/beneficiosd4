import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { normalizeRut } from "@/lib/rut";

// Devuelve los IDs de programas (con lista) a los que pertenece un RUT.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rutParam = req.nextUrl.searchParams.get("rut") || "";
  const rut = normalizeRut(rutParam);
  if (!rut) return NextResponse.json({ programIds: [] });

  const db = await getDb();
  const docs = await db
    .collection("program_members")
    .find({ rut })
    .project({ programId: 1 })
    .toArray();

  const programIds = docs.map((d) => String(d.programId));
  return NextResponse.json({ programIds });
}
