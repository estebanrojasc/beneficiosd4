import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getProgram } from "@/lib/programs";
import { commitStudents } from "@/lib/bulkImport";
import type { ImportStudent } from "@/lib/types";

export const maxDuration = 60;

// Carga definitiva: inserta los estudiantes seleccionados y cierra el proceso.
export async function POST(
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
  const students = Array.isArray(body.students)
    ? (body.students as ImportStudent[])
    : [];

  const db = await getDb();
  const job = await db
    .collection("bulk_imports")
    .findOne({ _id: new ObjectId(id) });
  if (!job)
    return NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });

  const program = await getProgram(db, job.programId || "");
  if (!program)
    return NextResponse.json(
      { error: "Programa no encontrado" },
      { status: 404 }
    );

  const summary = await commitStudents(db, program, students);

  await db.collection("bulk_imports").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "done",
        students,
        summary,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  return NextResponse.json({ ok: true, summary });
}
