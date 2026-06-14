import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { updateRole, deleteRole } from "@/lib/roles";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { key } = await params;
  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  await updateRole(db, key, { label: body.label, caps: body.caps });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await getSessionWithCap("usuarios");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const { key } = await params;
  const db = await getDb();
  const res = await deleteRole(db, key);
  if (!res.ok)
    return NextResponse.json(
      { error: "NO_ELIMINABLE", message: res.error },
      { status: 400 }
    );
  return NextResponse.json({ ok: true });
}
