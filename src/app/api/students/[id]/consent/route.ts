import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { buildGrantedConsent } from "@/lib/consentServer";
import { logAudit, ipFromRequest } from "@/lib/audit";

// Registra la autorización firmada por el apoderado para un estudiante.
// El documento físico ya debe estar firmado y archivado; aquí solo se deja
// constancia en el sistema de que existe y de sus datos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const built = buildGrantedConsent(body, session.username);
  if (!built.ok || !built.consent)
    return NextResponse.json({ error: built.error }, { status: 400 });

  const db = await getDb();
  const res = await db
    .collection("students")
    .updateOne(
      { _id: new ObjectId(id) },
      { $set: { consent: built.consent, updatedAt: new Date().toISOString() } }
    );
  if (res.matchedCount === 0)
    return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });

  await logAudit(db, {
    action: "consent.grant",
    actor: session.username,
    actorType: "admin",
    studentId: id,
    detail: `Autorización registrada (apoderado: ${built.consent.apoderadoNombre || "-"})`,
    meta: { termsVersion: built.consent.termsVersion },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true, consent: built.consent });
}

// Revoca el consentimiento (derecho de supresión): borra el descriptor facial
// y desactiva el enrolamiento. Deja registrado quién y cuándo lo revocó.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = await getDb();
  const now = new Date().toISOString();
  const res = await db.collection("students").updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        "consent.status": "revocado",
        "consent.revocadoAt": now,
        "consent.revocadoPor": session.username,
        "consent.requiereRegularizacion": false,
        faceDescriptor: null,
        enrolled: false,
        updatedAt: now,
      },
    }
  );
  if (res.matchedCount === 0)
    return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 });

  await logAudit(db, {
    action: "consent.revoke",
    actor: session.username,
    actorType: "admin",
    studentId: id,
    detail: "Autorización revocada; se eliminó la cara registrada",
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true });
}
