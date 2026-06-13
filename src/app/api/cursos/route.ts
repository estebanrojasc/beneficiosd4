import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { buildCursoName, getCicloConfig } from "@/lib/curso";

export async function GET() {
  const db = await getDb();
  const docs = await db
    .collection("cursos")
    .find({ activo: { $ne: false } })
    .sort({ anio: -1, ciclo: 1, nivel: 1, letra: 1 })
    .toArray();

  return NextResponse.json(
    docs.map((d) => ({
      _id: d._id?.toString(),
      nivel: d.nivel,
      ciclo: d.ciclo,
      letra: d.letra,
      nombre: d.nombre,
      anio: d.anio ?? new Date().getFullYear(),
      activo: d.activo ?? true,
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ciclo = String(body.ciclo || "").trim();
  const letra = String(body.letra || "").trim().toUpperCase();
  const anio = Number(body.anio) || new Date().getFullYear();

  const conf = getCicloConfig(ciclo);
  if (!conf)
    return NextResponse.json({ error: "Selecciona un ciclo válido" }, { status: 400 });

  // Prekínder/Kínder no usan número; el resto valida su rango.
  let nivel = 0;
  if (conf.usaNivel) {
    nivel = Number(body.nivel);
    const min = conf.min ?? 1;
    const max = conf.max ?? 12;
    if (!Number.isFinite(nivel) || nivel < min || nivel > max)
      return NextResponse.json(
        { error: `Nivel inválido para ${ciclo} (${min}° a ${max}°)` },
        { status: 400 }
      );
  }
  if (!letra || letra.length !== 1)
    return NextResponse.json({ error: "La letra debe ser un carácter (A, B, C...)" }, { status: 400 });

  const nombre = buildCursoName(nivel, ciclo, letra);
  const db = await getDb();

  // Un curso es único por nombre y año (puede existir "3° Básico A" en 2026 y 2027).
  const exists = await db.collection("cursos").findOne({ nombre, anio });
  if (exists)
    return NextResponse.json(
      { error: `El curso "${nombre}" ya existe en ${anio}` },
      { status: 409 }
    );

  const now = new Date().toISOString();
  const res = await db.collection("cursos").insertOne({
    nivel,
    ciclo,
    letra,
    nombre,
    anio,
    activo: true,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, _id: res.insertedId.toString(), nombre });
}
