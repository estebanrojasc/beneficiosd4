import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession, getSessionWithCap } from "@/lib/auth";
import {
  listPrograms,
  randomToken,
  claveFromName,
  uniqueSlug,
  nameExists,
} from "@/lib/programs";
import type { ProgramModalidad } from "@/lib/types";

// Lista de programas (cualquier usuario autenticado).
export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = await getDb();
  return NextResponse.json(await listPrograms(db));
}

// Crea un programa (administrador o coordinador).
export async function POST(req: NextRequest) {
  const session = await getSessionWithCap("programas");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const nombre = (body.nombre || "").toString().trim();
  const modalidad: ProgramModalidad =
    body.modalidad === "puntual" ? "puntual" : "temporal";
  if (!nombre)
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });

  const db = await getDb();

  // Los nombres deben ser únicos (el slug y la clave se derivan del nombre).
  if (await nameExists(db, nombre))
    return NextResponse.json(
      {
        error: "NOMBRE_DUPLICADO",
        message: "Ya existe un programa con ese nombre. Usa otro.",
      },
      { status: 409 }
    );

  const umbral = Number(body.umbralAsistencia);
  const ventana = Number(body.qrVentanaMin);
  const now = new Date().toISOString();
  const slug = await uniqueSlug(db, nombre);

  const result = await db.collection("programs").insertOne({
    nombre,
    descripcion: (body.descripcion || "").toString().trim(),
    modalidad,
    estado: "activo",
    icono: (body.icono || "🗂️").toString().slice(0, 4),
    color: (body.color || "#4f7cff").toString(),
    requiereMembresia: body.requiereMembresia !== false,
    permitirAutoRegistro: Boolean(body.permitirAutoRegistro),
    qrToken: randomToken(),
    qrVentanaMin: Number.isFinite(ventana) && ventana > 0 ? ventana : 0,
    validadorClave: claveFromName(nombre, new Date().getFullYear()),
    slug,
    umbralAsistencia:
      Number.isFinite(umbral) && umbral > 0 && umbral <= 100 ? umbral : 70,
    createdAt: now,
    updatedAt: now,
    createdBy: session.username,
  });

  return NextResponse.json({ ok: true, _id: result.insertedId.toString() });
}
