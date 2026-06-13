import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";

// Guarda o actualiza el descriptor facial de un estudiante (solo el vector, sin foto).
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
  const { faceDescriptor } = body as { faceDescriptor?: number[] };

  if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 512) {
    return NextResponse.json(
      { error: "Descriptor facial inválido (se esperan 512 valores)" },
      { status: 400 }
    );
  }

  const db = await getDb();
  await db.collection("students").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        faceDescriptor,
        enrolled: true,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  return NextResponse.json({ ok: true });
}
