import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { getSettings } from "@/lib/settings";
import { resolveCursoYear, linkStudentToCurso } from "@/lib/cursoServer";
import { findDuplicateFace } from "@/lib/faceMatchServer";

// Endpoint PÚBLICO de auto-enrolamiento (formulario al que se llega por QR).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { rut, nombre, apellidos, curso, faceDescriptor } = body as {
    rut?: string;
    nombre?: string;
    apellidos?: string;
    curso?: string;
    faceDescriptor?: number[];
  };

  if (!rut || !isValidRut(rut))
    return NextResponse.json({ error: "RUT inválido" }, { status: 400 });

  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 512)
    return NextResponse.json(
      { error: "Falta capturar la cara correctamente" },
      { status: 400 }
    );

  const norm = normalizeRut(rut);
  const db = await getDb();

  // Solo un docente con sesión puede confirmar caras muy parecidas (gemelos).
  const session = await getSession();
  const force = Boolean((body as { force?: boolean }).force) && Boolean(session);

  const allowed = await db.collection("allowedRuts").findOne({ rut: norm });
  const { enrolamientoAbierto, umbralCaraDuplicada } = await getSettings(db);

  // Evita que una misma cara se enrole bajo dos RUT distintos (suplantación).
  if (!force) {
    const dup = await findDuplicateFace(
      db,
      faceDescriptor,
      norm,
      umbralCaraDuplicada
    );
    if (dup) {
      return NextResponse.json(
        {
          error: "DUPLICATE_FACE",
          // Para el docente incluimos a quién se parece; para el público, no.
          match: session
            ? { nombre: dup.nombre, curso: dup.curso, score: Math.round(dup.score * 100) }
            : undefined,
          message:
            "Esta cara ya está enrolada con otro RUT. Si crees que es un error " +
            "(por ejemplo, tienes un hermano o gemelo muy parecido), acércate a " +
            "un docente para enrolarte.",
        },
        { status: 409 }
      );
    }
  }

  // Si no está en el listado autorizado, solo puede enrolarse cuando el
  // enrolamiento abierto está activo (y sin garantizar el almuerzo).
  // Un docente con sesión puede enrolar a cualquiera (p. ej. miembros de otros
  // programas que no pertenecen al almuerzo).
  if (!allowed && !enrolamientoAbierto && !session) {
    return NextResponse.json(
      {
        error: "NOT_ALLOWED",
        message:
          "Tu RUT no está en el listado de almuerzo. Debes acercarte a Orientación para conversar tu caso.",
      },
      { status: 403 }
    );
  }

  const cursoNombre = (curso || allowed?.curso || "").toString().trim();
  const anioFinal = await resolveCursoYear(db, cursoNombre);

  const now = new Date().toISOString();
  await db.collection("students").updateOne(
    { rut: norm },
    {
      $setOnInsert: { rut: norm, createdAt: now },
      $set: {
        nombre: (nombre || allowed?.nombre || "Sin nombre").toString().trim(),
        apellidos: (apellidos || "").toString().trim(),
        curso: cursoNombre,
        anio: anioFinal,
        // Solo se garantiza almuerzo si está en el listado autorizado.
        perteneceAlmuerzo: Boolean(allowed),
        faceDescriptor,
        enrolled: true,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  // Vinculamos el estudiante a su curso en la colección de cursos.
  const saved = await db
    .collection("students")
    .findOne({ rut: norm }, { projection: { _id: 1 } });
  if (saved?._id && cursoNombre) {
    await linkStudentToCurso(db, saved._id, cursoNombre);
  }

  return NextResponse.json({ ok: true, perteneceAlmuerzo: Boolean(allowed) });
}
