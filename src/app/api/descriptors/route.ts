import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { fullName } from "@/lib/curso";
import { isKioskTokenValid } from "@/lib/programs";

// Entrega los descriptores de los estudiantes enrolados para que el kiosko
// pueda reconocer caras incluso sin internet (se cachean en el dispositivo).
// Acceso: sesión de admin, token global (KIOSK_TOKEN) o clave de un programa.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const token =
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    "";

  const db = await getDb();

  if (!session && !(await isKioskTokenValid(db, token))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const docs = await db
    .collection("students")
    .find({ enrolled: true, faceDescriptor: { $ne: null } })
    .project({
      rut: 1,
      nombre: 1,
      apellidos: 1,
      curso: 1,
      perteneceAlmuerzo: 1,
      faceDescriptor: 1,
    })
    .toArray();

  const entries = docs.map((d) => ({
    rut: d.rut,
    nombre: fullName(d.nombre, d.apellidos),
    curso: d.curso,
    perteneceAlmuerzo: d.perteneceAlmuerzo,
    descriptor: d.faceDescriptor,
  }));

  return NextResponse.json({ entries, count: entries.length });
}
