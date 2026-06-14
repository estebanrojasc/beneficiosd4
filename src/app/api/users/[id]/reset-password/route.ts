import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { DEFAULT_PASSWORD, hashPassword } from "@/lib/users";

// Reinicia la clave de un usuario a la clave por defecto (o una indicada) y
// obliga a cambiarla en el próximo ingreso. Requiere permiso de usuarios.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const password = (body.password || DEFAULT_PASSWORD).toString();

  const db = await getDb();
  const result = await db.collection("users").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
        updatedAt: new Date().toISOString(),
      },
    }
  );
  if (result.matchedCount === 0)
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, initialPassword: password });
}
