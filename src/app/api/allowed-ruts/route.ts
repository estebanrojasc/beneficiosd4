import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { buildCursoName, getCicloConfig } from "@/lib/curso";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = await getDb();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { rut: { $regex: q, $options: "i" } },
      { nombre: { $regex: q, $options: "i" } },
      { apellidos: { $regex: q, $options: "i" } },
    ];
  }
  const docs = await db
    .collection("allowedRuts")
    .find(filter)
    .sort({ nombre: 1 })
    .limit(2000)
    .toArray();

  return NextResponse.json(
    docs.map((d) => ({ ...d, _id: d._id?.toString() }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = await getDb();
  const now = new Date().toISOString();

  // Carga masiva: cada línea "RUT;Nombre;Apellidos;Nivel;Ciclo;Letra" o solo "RUT".
  if (typeof body.bulk === "string") {
    const lines = body.bulk
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter(Boolean);

    let added = 0;
    let invalid = 0;
    for (const line of lines) {
      const parts = line.split(/[;,\t]/).map((p: string) => p.trim());
      const rawRut = parts[0];
      if (!isValidRut(rawRut)) {
        invalid++;
        continue;
      }
      const rut = normalizeRut(rawRut);
      const nombre = parts[1] || "";
      const apellidos = parts[2] || "";
      const nivel = parts[3] ? Number(parts[3]) : NaN;
      const ciclo = parts[4] || "";
      const letra = parts[5] || "";
      const conf = getCicloConfig(ciclo);
      // Para Prekínder/Kínder no se exige número de nivel.
      const nivelOk = conf ? (conf.usaNivel ? Number.isFinite(nivel) : true) : false;
      const curso =
        conf && nivelOk && letra ? buildCursoName(nivel, ciclo, letra) : "";

      const set: Record<string, string> = {};
      if (nombre) set.nombre = nombre;
      if (apellidos) set.apellidos = apellidos;
      if (curso) set.curso = curso;

      const update: Record<string, unknown> = {
        $setOnInsert: { rut, createdAt: now },
      };
      if (Object.keys(set).length > 0) update.$set = set;

      await db.collection("allowedRuts").updateOne({ rut }, update, {
        upsert: true,
      });
      added++;
    }
    return NextResponse.json({ ok: true, added, invalid });
  }

  // Alta individual.
  const { rut, nombre, apellidos, curso } = body as {
    rut?: string;
    nombre?: string;
    apellidos?: string;
    curso?: string;
  };
  if (!rut || !isValidRut(rut))
    return NextResponse.json({ error: "RUT inválido" }, { status: 400 });

  const norm = normalizeRut(rut);
  const set: Record<string, string> = {};
  if (nombre) set.nombre = nombre.trim();
  if (apellidos) set.apellidos = apellidos.trim();
  if (curso) set.curso = curso.trim();

  const update: Record<string, unknown> = {
    $setOnInsert: { rut: norm, createdAt: now },
  };
  if (Object.keys(set).length > 0) update.$set = set;

  await db.collection("allowedRuts").updateOne({ rut: norm }, update, {
    upsert: true,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rut = req.nextUrl.searchParams.get("rut");
  if (!rut)
    return NextResponse.json({ error: "Falta el RUT" }, { status: 400 });

  const db = await getDb();
  await db.collection("allowedRuts").deleteOne({ rut: normalizeRut(rut) });
  return NextResponse.json({ ok: true });
}
