import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { decryptDescriptor } from "@/lib/crypto";
import { logAudit, ipFromRequest } from "@/lib/audit";

// Exporta TODOS los datos personales de un estudiante en formato legible
// (derechos de acceso y portabilidad de la Ley 21.719). Incluye el descriptor
// biométrico descifrado, ya que es un dato del titular.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("estudiantes");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = await getDb();
  const student = await db
    .collection("students")
    .findOne({ _id: new ObjectId(id) });
  if (!student)
    return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });

  const rut = student.rut as string;

  // Asistencia (programa almuerzo / temporal por día).
  const attendanceDays = await db
    .collection("attendance")
    .find({ "records.rut": rut })
    .project({ fecha: 1, records: 1 })
    .toArray();
  const asistencia = attendanceDays.flatMap((day) =>
    (day.records || [])
      .filter((r: { rut: string }) => r.rut === rut)
      .map((r: { timestamp: string; method: string }) => ({
        fecha: day.fecha,
        timestamp: r.timestamp,
        method: r.method,
      }))
  );

  // Registros en programas y membresías.
  const [programRecords, memberships, auditLogs] = await Promise.all([
    db
      .collection("program_records")
      .find({ rut })
      .project({ _id: 0, programId: 1, fecha: 1, timestamp: 1, method: 1 })
      .toArray(),
    db
      .collection("program_members")
      .find({ rut })
      .project({ _id: 0, programId: 1, createdAt: 1 })
      .toArray(),
    db
      .collection("audit_logs")
      .find({ rut })
      .project({ _id: 0 })
      .sort({ at: -1 })
      .toArray(),
  ]);

  const descriptor = decryptDescriptor(student.faceDescriptor);

  const exportData = {
    generadoAt: new Date().toISOString(),
    generadoPor: session.username,
    titular: {
      nombre: student.nombre,
      apellidos: student.apellidos,
      rut: student.rut,
      curso: student.curso,
      anio: student.anio,
      perteneceAlmuerzo: student.perteneceAlmuerzo,
      enrolled: student.enrolled,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt,
    },
    consentimiento: student.consent || null,
    biometria: {
      tieneDescriptor: Array.isArray(descriptor),
      // Vector ArcFace (512 números). NO es una fotografía.
      descriptor: descriptor || null,
    },
    asistencia,
    registrosProgramas: programRecords,
    membresias: memberships,
    auditoria: auditLogs,
  };

  await logAudit(db, {
    action: "data.export",
    actor: session.username,
    actorType: "admin",
    rut,
    studentId: id,
    detail: "Exportación de datos del titular (acceso/portabilidad)",
    ip: ipFromRequest(req),
  });

  const filename = `datos-${rut || id}.json`;
  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
