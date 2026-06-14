import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import type { ImportStudent } from "@/lib/types";

// Guarda las correcciones de la revisión (para poder continuar después).
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
  const students = Array.isArray(body.students)
    ? (body.students as ImportStudent[])
    : null;
  if (!students)
    return NextResponse.json({ error: "Faltan estudiantes" }, { status: 400 });

  const db = await getDb();
  await db
    .collection("bulk_imports")
    .updateOne(
      { _id: new ObjectId(id) },
      { $set: { students, updatedAt: new Date().toISOString() } }
    );
  return NextResponse.json({ ok: true });
}
