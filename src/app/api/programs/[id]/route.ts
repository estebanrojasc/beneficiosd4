import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession, getSessionWithCap } from "@/lib/auth";
import {
  getProgram,
  randomToken,
  claveFromName,
  nameExists,
  toPublicProgram,
  programValidadorAuthorized,
} from "@/lib/programs";

function reqToken(req: NextRequest): string {
  return (
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    ""
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const { id } = await params;
  const db = await getDb();
  const p = await getProgram(db, id);
  if (!p)
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });
  if (!programValidadorAuthorized(p, reqToken(req), Boolean(session)))
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(toPublicProgram(p));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("programas");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  if (!ObjectId.isValid(id))
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const db = await getDb();
  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (typeof body.nombre === "string" && body.nombre.trim()) {
    const nuevo = body.nombre.trim();
    if (await nameExists(db, nuevo, id))
      return NextResponse.json(
        {
          error: "NOMBRE_DUPLICADO",
          message: "Ya existe un programa con ese nombre. Usa otro.",
        },
        { status: 409 }
      );
    update.nombre = nuevo;
  }
  if (typeof body.descripcion === "string")
    update.descripcion = body.descripcion.trim();
  if (typeof body.icono === "string") update.icono = body.icono.slice(0, 4);
  if (typeof body.color === "string") update.color = body.color;
  if (typeof body.requiereMembresia === "boolean")
    update.requiereMembresia = body.requiereMembresia;
  if (typeof body.permitirAutoRegistro === "boolean")
    update.permitirAutoRegistro = body.permitirAutoRegistro;
  if (body.estado === "activo" || body.estado === "cerrado")
    update.estado = body.estado;
  if (body.qrVentanaMin !== undefined) {
    const v = Number(body.qrVentanaMin);
    update.qrVentanaMin = Number.isFinite(v) && v > 0 ? v : 0;
  }
  if (body.umbralAsistencia !== undefined) {
    const u = Number(body.umbralAsistencia);
    if (Number.isFinite(u) && u > 0 && u <= 100) update.umbralAsistencia = u;
  }
  if (typeof body.validadorClave === "string") {
    const k = body.validadorClave.trim().toLowerCase().replace(/\s+/g, "");
    if (k) update.validadorClave = k;
  }
  // Restablecer la clave del validador a la sugerida (nombre + año).
  if (body.regenerarClave === true) {
    const p = await getProgram(db, id);
    const nom = (update.nombre as string) || p?.nombre || "programa";
    update.validadorClave = claveFromName(nom, new Date().getFullYear());
  }
  // Regenerar el token del QR (invalida el anterior).
  if (body.regenerarToken === true) update.qrToken = randomToken();
  // Abrir / cerrar la ventana de auto-registro por QR.
  if (body.abrirRegistro === true) update.qrOpenAt = new Date().toISOString();
  if (body.cerrarRegistro === true) update.qrOpenAt = null;

  await db
    .collection("programs")
    .updateOne({ _id: new ObjectId(id) }, { $set: update });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionWithCap("programas");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const db = await getDb();
  const p = await getProgram(db, id);
  if (!p)
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });

  await db.collection("programs").deleteOne({ _id: new ObjectId(id) });
  await db.collection("program_members").deleteMany({ programId: id });
  await db.collection("program_records").deleteMany({ programId: id });
  return NextResponse.json({ ok: true });
}
