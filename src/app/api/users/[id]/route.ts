import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { roleExists } from "@/lib/roles";

// Actualiza nombre, rol o estado (activo/inactivo) de un usuario.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = await getDb();
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.nombre === "string") update.nombre = body.nombre.trim();
  if (typeof body.active === "boolean") update.active = body.active;
  if (body.role !== undefined) {
    if (!(await roleExists(db, body.role)))
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    update.role = body.role;
  }

  // Evita que el admin se desactive o se quite el rol a sí mismo y quede fuera.
  if (id === session.userId && (update.active === false || update.role)) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol o estado" },
      { status: 400 }
    );
  }

  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(id) }, { $set: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  if (id === session.userId)
    return NextResponse.json(
      { error: "No puedes eliminar tu propio usuario" },
      { status: 400 }
    );

  const db = await getDb();
  await db.collection("users").deleteOne({ _id: new ObjectId(id) });
  return NextResponse.json({ ok: true });
}
