import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { listRoles, createRole } from "@/lib/roles";

// Lista de roles con su matriz de permisos (requiere permiso de usuarios).
export async function GET() {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const db = await getDb();
  return NextResponse.json(await listRoles(db));
}

// Crea un rol nuevo.
export async function POST(req: NextRequest) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const res = await createRole(db, body.label, body.caps);
  if (!res.ok)
    return NextResponse.json(
      { error: "DUPLICADO", message: res.error },
      { status: 409 }
    );
  return NextResponse.json({ ok: true, key: res.key });
}
