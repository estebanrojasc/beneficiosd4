import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { normalizeRut } from "@/lib/rut";
import {
  getProgram,
  markRecord,
  registeredRuts,
  isMember,
  programValidadorAuthorized,
} from "@/lib/programs";

function reqToken(req: NextRequest): string {
  return (
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    ""
  );
}

// Registra una marca (asistencia o entrega) en el programa.
export async function POST(
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
  if (p.estado !== "activo")
    return NextResponse.json({ error: "El programa está cerrado" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (!body.rut)
    return NextResponse.json({ error: "Falta el RUT" }, { status: 400 });
  const rut = normalizeRut(body.rut);

  // Si el programa exige lista, el RUT debe pertenecer a ella.
  if (p.requiereMembresia && !(await isMember(db, p, rut))) {
    return NextResponse.json(
      { error: "NOT_MEMBER", message: "No está en la lista de este programa." },
      { status: 403 }
    );
  }

  const result = await markRecord(db, p, {
    rut,
    nombre: body.nombre || "",
    curso: body.curso || "",
    method: body.method === "manual" ? "manual" : body.method === "qr" ? "qr" : "facial",
    by: session?.username,
    timestamp: body.timestamp,
  });
  return NextResponse.json(result);
}

// Lista los RUTs ya registrados (hoy si es temporal; histórico si es puntual).
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

  const fecha = req.nextUrl.searchParams.get("fecha") || undefined;
  const ruts = await registeredRuts(db, p, fecha);
  return NextResponse.json({ ruts, total: ruts.length });
}
