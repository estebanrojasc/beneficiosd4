import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { splitNombreCompleto } from "@/lib/curso";
import { getSettings } from "@/lib/settings";

// Endpoint PÚBLICO: valida si un RUT pertenece al listado de almuerzo.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { rut } = body as { rut?: string };

  if (!rut || !isValidRut(rut)) {
    return NextResponse.json(
      { allowed: false, error: "RUT inválido" },
      { status: 400 }
    );
  }

  const norm = normalizeRut(rut);
  const db = await getDb();

  const allowed = await db.collection("allowedRuts").findOne({ rut: norm });
  const student = await db.collection("students").findOne({ rut: norm });
  const { enrolamientoAbierto } = await getSettings(db);

  let nombre = "";
  let apellidos = "";
  if (student) {
    nombre = student.nombre || "";
    apellidos = student.apellidos || "";
  } else if (allowed?.apellidos || allowed?.nombre) {
    // Datos previos del listado: usa campos separados si existen.
    if (allowed?.apellidos) {
      nombre = String(allowed.nombre || "");
      apellidos = String(allowed.apellidos);
    } else {
      const split = splitNombreCompleto(String(allowed.nombre));
      nombre = split.nombre;
      apellidos = split.apellidos;
    }
  }

  return NextResponse.json({
    // Puede continuar si está en el listado, o si el enrolamiento abierto está activo.
    allowed: Boolean(allowed) || enrolamientoAbierto,
    inList: Boolean(allowed),
    openEnrollment: enrolamientoAbierto,
    alreadyEnrolled: Boolean(student?.enrolled),
    nombre,
    apellidos,
    curso: allowed?.curso || student?.curso || "",
  });
}
