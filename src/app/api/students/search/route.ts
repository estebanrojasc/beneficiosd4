import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";

interface SearchResult {
  rut: string;
  nombre: string;
  apellidos: string;
  curso: string;
  perteneceAlmuerzo: boolean;
  enrolled: boolean;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Búsqueda rápida de estudiantes por nombre/apellido/RUT.
// Pensada para el ingreso manual del kiosko (acceso por token o sesión admin).
// Combina la colección de estudiantes con la lista de RUTs autorizados.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const token =
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    "";
  const kioskToken = process.env.KIOSK_TOKEN || "kiosko2026";

  if (!session && token !== kioskToken) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const db = await getDb();
  const rx = { $regex: escapeRegex(q), $options: "i" };

  const studentDocs = await db
    .collection("students")
    .find({
      $or: [
        { nombre: rx },
        { apellidos: rx },
        { rut: rx },
        { curso: rx },
      ],
    })
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1, perteneceAlmuerzo: 1, enrolled: 1 })
    .limit(25)
    .toArray();

  const byRut = new Map<string, SearchResult>();
  for (const d of studentDocs) {
    byRut.set(d.rut, {
      rut: d.rut,
      nombre: d.nombre || "",
      apellidos: d.apellidos || "",
      curso: d.curso || "",
      perteneceAlmuerzo: Boolean(d.perteneceAlmuerzo),
      enrolled: Boolean(d.enrolled),
    });
  }

  // Completamos con la lista autorizada (estudiantes aún no creados/enrolados).
  const allowedDocs = await db
    .collection("allowedRuts")
    .find({
      $or: [{ nombre: rx }, { apellidos: rx }, { rut: rx }],
    })
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1 })
    .limit(25)
    .toArray();

  for (const a of allowedDocs) {
    if (byRut.has(a.rut)) continue;
    byRut.set(a.rut, {
      rut: a.rut,
      nombre: a.nombre || "",
      apellidos: a.apellidos || "",
      curso: a.curso || "",
      // Estar en la lista autorizada implica que pertenece al almuerzo.
      perteneceAlmuerzo: true,
      enrolled: false,
    });
  }

  const results = Array.from(byRut.values())
    .sort((a, b) =>
      `${a.nombre} ${a.apellidos}`.localeCompare(`${b.nombre} ${b.apellidos}`)
    )
    .slice(0, 25);

  return NextResponse.json({ results });
}
