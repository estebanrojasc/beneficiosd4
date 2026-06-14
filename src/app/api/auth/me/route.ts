import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getRoleCaps } from "@/lib/roles";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const db = await getDb();
  const caps = await getRoleCaps(db, session.role);
  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    username: session.username,
    nombre: session.nombre,
    role: session.role,
    caps,
    mustChangePassword: Boolean(session.mustChangePassword),
  });
}
