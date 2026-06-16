import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { listAudit } from "@/lib/audit";

// Lista el registro de auditoría de datos biométricos/personales.
// Requiere el permiso "auditoria".
export async function GET(req: NextRequest) {
  const session = await getSessionWithCap("auditoria");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const db = await getDb();
  const result = await listAudit(db, {
    action: sp.get("action") || undefined,
    rut: sp.get("rut") || undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : 50,
    skip: sp.get("skip") ? Number(sp.get("skip")) : 0,
  });

  return NextResponse.json(result);
}
