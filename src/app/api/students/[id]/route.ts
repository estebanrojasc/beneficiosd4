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
import { syncAllowedRut } from "@/lib/allowedRutsServer";
import { findDuplicateFace } from "@/lib/faceMatchServer";
import { getSettings } from "@/lib/settings";
import { fullName } from "@/lib/curso";
import { isConsentGranted, isConsentBypassEnabled } from "@/lib/consentServer";
import { encryptDescriptor } from "@/lib/crypto";
import { logAudit, ipFromRequest } from "@/lib/audit";

// Devuelve un estudiante por id (sin el descriptor facial). Se usa, entre
// otras cosas, para imprimir el documento de autorización del apoderado.
export async function GET(
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
  const doc = await db
    .collection("students")
    .findOne(
      { _id: new ObjectId(id) },
      { projection: { faceDescriptor: 0 } }
    );
  if (!doc)
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ ...doc, _id: doc._id.toString() });
}

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
  const force = Boolean(body.force);
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
    update.faceDescriptor =
      body.faceDescriptor.length > 0
        ? encryptDescriptor(body.faceDescriptor)
        : null;
    update.enrolled = body.faceDescriptor.length > 0;
  }

  const db = await getDb();

  // La biometría (cara) solo se puede registrar si el apoderado autorizó.
  if (Array.isArray(body.faceDescriptor) && body.faceDescriptor.length > 0) {
    const current = await db
      .collection("students")
      .findOne({ _id: new ObjectId(id) }, { projection: { consent: 1 } });
    if (!isConsentGranted(current?.consent) && !isConsentBypassEnabled()) {
      return NextResponse.json(
        {
          error: "CONSENT_REQUIRED",
          message:
            "No se puede registrar la cara sin la autorización firmada del " +
            "apoderado. Registra primero la autorización.",
        },
        { status: 409 }
      );
    }
  }

  // No se permite re-enrolar con una cara idéntica a la de otro estudiante.
  if (
    Array.isArray(body.faceDescriptor) &&
    body.faceDescriptor.length > 0 &&
    !force
  ) {
    const current = await db
      .collection("students")
      .findOne({ _id: new ObjectId(id) }, { projection: { rut: 1 } });
    const ownRut = (update.rut as string) || current?.rut || "";
    const { umbralCaraDuplicada } = await getSettings(db);
    const dup = await findDuplicateFace(
      db,
      body.faceDescriptor,
      ownRut,
      umbralCaraDuplicada
    );
    if (dup) {
      return NextResponse.json(
        {
          error: "DUPLICATE_FACE",
          match: {
            nombre: fullName(dup.nombre, dup.apellidos),
            curso: dup.curso,
            score: Math.round(dup.score * 100),
          },
        },
        { status: 409 }
      );
    }
  }

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

  // Reflejamos la marca "pertenece almuerzo" en la Lista almuerzo.
  const saved = await db
    .collection("students")
    .findOne(
      { _id: new ObjectId(id) },
      { projection: { rut: 1, nombre: 1, apellidos: 1, curso: 1, perteneceAlmuerzo: 1 } }
    );
  if (saved?.rut) {
    await syncAllowedRut(db, {
      rut: saved.rut,
      perteneceAlmuerzo: Boolean(saved.perteneceAlmuerzo),
      nombre: saved.nombre,
      apellidos: saved.apellidos,
      curso: saved.curso,
    });
  }

  // Auditoría: se reemplazó/actualizó la cara del estudiante.
  if (Array.isArray(body.faceDescriptor) && body.faceDescriptor.length > 0) {
    await logAudit(db, {
      action: "face.update",
      actor: session.username,
      actorType: "admin",
      rut: saved?.rut,
      studentId: id,
      detail: "Reemplazo de la cara registrada",
      ip: ipFromRequest(req),
    });
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
  // Recuperamos el RUT antes de borrar para limpiar sus listas asociadas.
  const doc = await db
    .collection("students")
    .findOne(
      { _id: new ObjectId(id) },
      { projection: { rut: 1, enrolled: 1 } }
    );
  await db.collection("students").deleteOne({ _id: new ObjectId(id) });
  await unlinkStudentFromCursos(db, new ObjectId(id));

  // Al borrar al estudiante, queda fuera de la Lista almuerzo y de cualquier
  // membresía de programa (no debe quedar como autorizado "fantasma").
  if (doc?.rut) {
    await db.collection("allowedRuts").deleteOne({ rut: doc.rut });
    await db.collection("program_members").deleteMany({ rut: doc.rut });
  }

  // Auditoría: supresión del titular (derecho de supresión).
  await logAudit(db, {
    action: "student.delete",
    actor: session.username,
    actorType: "admin",
    rut: doc?.rut,
    studentId: id,
    detail: "Eliminación del estudiante y sus datos",
    meta: { teniaCara: Boolean(doc?.enrolled) },
    ip: ipFromRequest(req),
  });
  return NextResponse.json({ ok: true });
}
