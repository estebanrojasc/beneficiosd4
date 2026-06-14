import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { roleExists } from "@/lib/roles";
import {
  DEFAULT_PASSWORD,
  hashPassword,
  normalizeUsername,
  toPublicUser,
} from "@/lib/users";

// Lista de usuarios (requiere permiso de usuarios).
export async function GET() {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = await getDb();
  const docs = await db
    .collection("users")
    .find({})
    .sort({ username: 1 })
    .toArray();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json(docs.map((d) => toPublicUser(d as any)));
}

// Crea un usuario con clave por defecto y cambio obligatorio en primer ingreso.
export async function POST(req: NextRequest) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const username = normalizeUsername(body.username || "");
  const nombre = (body.nombre || "").toString().trim();
  const role = (body.role || "").toString();
  const password = (body.password || DEFAULT_PASSWORD).toString();

  if (!username || username.length < 3)
    return NextResponse.json(
      { error: "El usuario debe tener al menos 3 caracteres" },
      { status: 400 }
    );
  if (!nombre)
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const db = await getDb();
  if (!(await roleExists(db, role)))
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });

  const exists = await db.collection("users").findOne({ username });
  if (exists)
    return NextResponse.json(
      { error: "Ya existe un usuario con ese nombre" },
      { status: 409 }
    );

  const now = new Date().toISOString();
  const result = await db.collection("users").insertOne({
    username,
    nombre,
    role,
    active: true,
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    createdAt: now,
    updatedAt: now,
    lastLogin: null,
    createdBy: session.username,
  });

  return NextResponse.json({
    ok: true,
    _id: result.insertedId.toString(),
    // Devolvemos la clave inicial para que el admin la comunique una sola vez.
    initialPassword: password,
  });
}
