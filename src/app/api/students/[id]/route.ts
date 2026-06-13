import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isValidRut, normalizeRut } from "@/lib/rut";
import {
  resolveCursoYear,
  linkStudentToCurso,
  unlinkStudentFromCursos,
} from "@/lib/cursoServer";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (typeof body.nombre === "string") update.nombre = body.nombre.trim();
  if (typeof body.apellidos === "string") update.apellidos = body.apellidos.trim();
  if (typeof body.perteneceAlmuerzo === "boolean")
    update.perteneceAlmuerzo = body.perteneceAlmuerzo;
  if (typeof body.rut === "string") {
    if (!isValidRut(body.rut))
      return NextResponse.json({ error: "RUT inválido" }, { status: 400 });
    update.rut = normalizeRut(body.rut);
  }
  if (Array.isArray(body.faceDescriptor)) {
    update.faceDescriptor = body.faceDescriptor;
    update.enrolled = body.faceDescriptor.length > 0;
  }

  const db = await getDb();

  // Al cambiar de curso, el año se hereda del curso.
  if (typeof body.curso === "string") {
    const curso = body.curso.trim();
    update.curso = curso;
    update.anio = await resolveCursoYear(db, curso);
  } else if (body.anio !== undefined) {
    update.anio = Number(body.anio);
  }

  await db
    .collection("students")
    .updateOne({ _id: new ObjectId(id) }, { $set: update });

  // Si cambió el curso, actualizamos el vínculo en la colección de cursos.
  if (typeof body.curso === "string") {
    await linkStudentToCurso(db, new ObjectId(id), body.curso.trim());
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = await getDb();
  await db.collection("students").deleteOne({ _id: new ObjectId(id) });
  await unlinkStudentFromCursos(db, new ObjectId(id));
  return NextResponse.json({ ok: true });
}
