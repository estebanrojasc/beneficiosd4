import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession, signSession, setSessionCookie } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/users";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!newPassword || newPassword.length < 6) {
    return NextResponse.json(
      { error: "La nueva clave debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }

  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ _id: new ObjectId(session.userId) });
  if (!user)
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const ok = await verifyPassword(currentPassword || "", user.passwordHash);
  if (!ok)
    return NextResponse.json(
      { error: "La clave actual es incorrecta" },
      { status: 400 }
    );

  const now = new Date().toISOString();
  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        updatedAt: now,
      },
    }
  );

  // Re-emitimos la sesión sin la marca de cambio obligatorio.
  const token = signSession({
    userId: user._id.toString(),
    username: user.username,
    nombre: user.nombre,
    role: user.role,
    mustChangePassword: false,
  });
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
