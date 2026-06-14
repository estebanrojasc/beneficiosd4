import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { cosineSimilarity } from "@/lib/faceMatchServer";
import { fullName } from "@/lib/curso";
import {
  getProgramByToken,
  isMember,
  markRecord,
  registrationStatus,
} from "@/lib/programs";

// Umbral de verificación 1:1 (misma persona). Alineado con el kiosko (0.42).
const VERIFY_THRESHOLD = 0.42;

// Info pública del programa para la página de auto-registro por QR.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = await getDb();
  const p = await getProgramByToken(db, token);
  if (!p)
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });

  const status = registrationStatus(p);
  return NextResponse.json({
    nombre: p.nombre,
    icono: p.icono,
    color: p.color,
    modalidad: p.modalidad,
    requiereMembresia: p.requiereMembresia,
    open: status.open,
    expiresAt: status.expiresAt,
  });
}

// Auto-registro del estudiante: verifica su cara contra el enrolamiento (1:1).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = await getDb();
  const p = await getProgramByToken(db, token);
  if (!p)
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });

  const status = registrationStatus(p);
  if (!status.open)
    return NextResponse.json(
      { error: "CLOSED", message: "El registro de este programa está cerrado." },
      { status: 403 }
    );

  const body = await req.json().catch(() => ({}));
  const { rut, faceDescriptor } = body as {
    rut?: string;
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
  const student = await db.collection("students").findOne({ rut: norm });
  if (!student || !student.enrolled || !Array.isArray(student.faceDescriptor)) {
    return NextResponse.json(
      {
        error: "NOT_ENROLLED",
        message:
          "Tu RUT no está enrolado. Acércate a un docente para enrolarte primero.",
      },
      { status: 403 }
    );
  }

  // Verificación 1:1: la cara capturada debe coincidir con la enrolada.
  const score = cosineSimilarity(faceDescriptor, student.faceDescriptor);
  if (score < VERIFY_THRESHOLD) {
    return NextResponse.json(
      {
        error: "FACE_MISMATCH",
        message:
          "La cara no coincide con la enrolada para ese RUT. Inténtalo de nuevo con buena luz.",
      },
      { status: 403 }
    );
  }

  if (p.requiereMembresia && !(await isMember(db, p, norm))) {
    return NextResponse.json(
      { error: "NOT_MEMBER", message: "No estás en la lista de este programa." },
      { status: 403 }
    );
  }

  const result = await markRecord(db, p, {
    rut: norm,
    nombre: fullName(student.nombre, student.apellidos),
    curso: student.curso || "",
    method: "qr",
  });

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    nombre: fullName(student.nombre, student.apellidos),
  });
}
