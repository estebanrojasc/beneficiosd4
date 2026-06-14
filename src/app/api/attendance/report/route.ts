import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { monthInTZ } from "@/lib/date";
import { fullName } from "@/lib/curso";

interface ReportStudent {
  rut: string;
  nombre: string;
  curso: string;
  attended: string[];
  count: number;
  percentage: number;
}

// Reporte mensual de asistencia al almuerzo.
// Devuelve, por cada estudiante de la lista de almuerzo, los días que asistió
// dentro del mes y su porcentaje respecto a los días en que hubo servicio.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = await getDb();
  const month = (req.nextUrl.searchParams.get("month") || monthInTZ()).slice(0, 7);
  const settings = await getSettings(db);

  // Documentos de asistencia del mes (fecha "YYYY-MM-DD" que empieza con el mes).
  const days = await db
    .collection("attendance")
    .find({ fecha: { $regex: `^${month}` } })
    .sort({ fecha: 1 })
    .toArray();

  const serviceDays: string[] = [];
  const attendedByRut = new Map<string, Set<string>>();
  for (const day of days) {
    const fecha: string = day.fecha;
    const records: { rut: string }[] = Array.isArray(day.records)
      ? day.records
      : [];
    if (records.length > 0) serviceDays.push(fecha);
    for (const r of records) {
      if (!r.rut) continue;
      if (!attendedByRut.has(r.rut)) attendedByRut.set(r.rut, new Set());
      attendedByRut.get(r.rut)!.add(fecha);
    }
  }

  // Roster: estudiantes que pertenecen al almuerzo (Lista almuerzo).
  const allowed = await db
    .collection("allowedRuts")
    .find({})
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1 })
    .toArray();

  const studentDocs = await db
    .collection("students")
    .find({})
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1, perteneceAlmuerzo: 1 })
    .toArray();
  const studentByRut = new Map(studentDocs.map((s) => [s.rut, s]));

  const rosterRuts = new Set<string>();
  for (const a of allowed) rosterRuts.add(a.rut);
  for (const s of studentDocs) if (s.perteneceAlmuerzo) rosterRuts.add(s.rut);

  const allowedByRut = new Map(allowed.map((a) => [a.rut, a]));
  const totalService = serviceDays.length;

  const students: ReportStudent[] = Array.from(rosterRuts).map((rut) => {
    const s = studentByRut.get(rut);
    const a = allowedByRut.get(rut);
    const nombre =
      fullName(
        (s?.nombre || a?.nombre || "") as string,
        (s?.apellidos || a?.apellidos || "") as string
      ) || "Sin nombre";
    const curso = (s?.curso || a?.curso || "") as string;
    const attended = Array.from(attendedByRut.get(rut) || []).sort();
    const count = attended.length;
    const percentage =
      totalService > 0 ? Math.round((count / totalService) * 100) : 0;
    return { rut, nombre, curso, attended, count, percentage };
  });

  students.sort((x, y) => {
    const cx = x.curso || "zzz";
    const cy = y.curso || "zzz";
    const byCurso = cx.localeCompare(cy, "es", { numeric: true });
    if (byCurso !== 0) return byCurso;
    return x.nombre.localeCompare(y.nombre, "es");
  });

  return NextResponse.json({
    month,
    days: serviceDays,
    serviceDays: totalService,
    umbral: settings.umbralAsistencia,
    students,
  });
}
