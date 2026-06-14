import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { signSession, setSessionCookie } from "@/lib/auth";
import {
  ensureSeedAdmin,
  findUserByUsername,
  verifyPassword,
} from "@/lib/users";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return NextResponse.json(
      { ok: false, error: "Usuario y clave son obligatorios" },
      { status: 400 }
    );
  }

  const db = await getDb();
  // Si la base no tiene usuarios, sembramos el admin inicial del entorno.
  await ensureSeedAdmin(db);

  const user = await findUserByUsername(db, username);
  if (!user || !user.active) {
    return NextResponse.json(
      { ok: false, error: "Usuario o clave incorrectos" },
      { status: 401 }
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: "Usuario o clave incorrectos" },
      { status: 401 }
    );
  }

  await db
    .collection("users")
    .updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date().toISOString() } }
    );

  const token = signSession({
    userId: user._id.toString(),
    username: user.username,
    nombre: user.nombre,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  });
  await setSessionCookie(token);

  return NextResponse.json({
    ok: true,
    username: user.username,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  });
}
