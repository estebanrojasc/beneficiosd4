import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getProgramByValidadorClave } from "@/lib/programs";

// Resuelve un programa por su clave de validador. Es público a propósito: la
// clave ES el control de acceso (igual que el token de un kiosko). Devuelve solo
// datos mínimos para arrancar la validación de ese programa.
export async function GET(req: NextRequest) {
  const clave = req.nextUrl.searchParams.get("clave") || "";
  if (!clave.trim())
    return NextResponse.json({ error: "Falta la clave" }, { status: 400 });

  const db = await getDb();
  const p = await getProgramByValidadorClave(db, clave);
  if (!p)
    return NextResponse.json(
      { error: "NOT_FOUND", message: "La clave no corresponde a ningún programa." },
      { status: 404 }
    );

  if (p.estado !== "activo")
    return NextResponse.json(
      { error: "CLOSED", message: "Ese programa está finalizado." },
      { status: 403 }
    );

  return NextResponse.json({
    id: p._id.toString(),
    slug: p.slug || p._id.toString(),
    nombre: p.nombre,
    icono: p.icono || "🗂️",
    modalidad: p.modalidad,
  });
}
