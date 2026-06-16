import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("auditoria");
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const db = await getDb();
  const log = await db.collection("audit_logs").findOne({ _id: new ObjectId(id) });
  if (!log) {
    return NextResponse.json({ error: "Log no encontrado" }, { status: 404 });
  }

  const settings = await getSettings(db);

  // Generar hash de prueba criptográfica del log de auditoría (para validez ISO 27001)
  const dataToHash = `${log._id.toString()}|${log.action}|${log.actor}|${log.rut || ""}|${log.at}`;
  const verificationHash = crypto.createHash("sha256").update(dataToHash).digest("hex");

  return NextResponse.json({
    log: {
      ...log,
      _id: log._id.toString(),
      verificationHash,
    },
    settings: {
      establecimientoNombre: settings.establecimientoNombre,
      responsableTratamiento: settings.responsableTratamiento,
      dpoNombre: settings.dpoNombre,
      dpoContacto: settings.dpoContacto,
    },
  });
}
