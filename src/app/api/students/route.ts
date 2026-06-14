import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { resolveCursoYear, linkStudentToCurso } from "@/lib/cursoServer";
import { syncAllowedRut } from "@/lib/allowedRutsServer";
import { findDuplicateFace } from "@/lib/faceMatchServer";
import { getSettings } from "@/lib/settings";
import { fullName } from "@/lib/curso";

interface StudentDoc {
  _id?: ObjectId;
  nombre: string;
  apellidos: string;
  curso: string;
  anio: number;
  rut: string;
  perteneceAlmuerzo: boolean;
  faceDescriptor: number[] | null;
  enrolled: boolean;
  createdAt: string;
  updatedAt: string;
}

function serialize(doc: StudentDoc) {
  return {
    ...doc,
    _id: doc._id?.toString(),
    // No exponemos el descriptor en el listado general (es pesado y sensible).
    faceDescriptor: undefined,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = await getDb();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const anioParam = req.nextUrl.searchParams.get("anio");
  const cursoParam = req.nextUrl.searchParams.get("curso")?.trim();
  const filter: Record<string, unknown> = {};
  if (q) {
    filter.$or = [
      { nombre: { $regex: q, $options: "i" } },
      { apellidos: { $regex: q, $options: "i" } },
      { rut: { $regex: q, $options: "i" } },
      { curso: { $regex: q, $options: "i" } },
    ];
  }
  // Filtro exacto por curso (usado al ver el detalle de un curso).
  if (cursoParam) filter.curso = cursoParam;
  // anio="all" muestra todos; sin parámetro o numérico filtra por año.
  if (anioParam && anioParam !== "all") {
    const anio = Number(anioParam);
    if (Number.isFinite(anio)) filter.anio = anio;
  }

  const docs = await db
    .collection<StudentDoc>("students")
    .find(filter)
    .sort({ nombre: 1 })
    .limit(500)
    .toArray();

  return NextResponse.json(docs.map(serialize));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { nombre, apellidos, curso, rut, perteneceAlmuerzo, faceDescriptor } =
    body as Partial<StudentDoc>;
  // El docente puede confirmar un enrolamiento aunque la cara se parezca mucho
  // a otra (caso de gemelos/hermanos): para eso envía force = true.
  const force = Boolean((body as { force?: boolean }).force);

  if (!nombre || !apellidos || !curso || !rut) {
    return NextResponse.json(
      { error: "Nombre, apellidos, curso y RUT son obligatorios" },
      { status: 400 }
    );
  }
  if (!isValidRut(rut)) {
    return NextResponse.json({ error: "RUT inválido" }, { status: 400 });
  }

  const db = await getDb();
  const normRut = normalizeRut(rut);

  const exists = await db.collection("students").findOne({ rut: normRut });
  if (exists) {
    return NextResponse.json(
      { error: "Ya existe un estudiante con ese RUT" },
      { status: 409 }
    );
  }

  // No se permite enrolar dos veces la misma cara (salvo confirmación explícita).
  if (Array.isArray(faceDescriptor) && faceDescriptor.length > 0 && !force) {
    const { umbralCaraDuplicada } = await getSettings(db);
    const dup = await findDuplicateFace(
      db,
      faceDescriptor,
      normRut,
      umbralCaraDuplicada
    );
    if (dup) {
      return NextResponse.json(
        {
          error: "DUPLICATE_FACE",
          match: {
            nombre: fullName(dup.nombre, dup.apellidos),
            curso: dup.curso,
            score: Math.round(dup.score * 100),
          },
        },
        { status: 409 }
      );
    }
  }

  // El año se hereda del curso seleccionado.
  const anioFinal = await resolveCursoYear(db, curso);

  const now = new Date().toISOString();
  const doc: StudentDoc = {
    nombre: nombre.trim(),
    apellidos: (apellidos || "").trim(),
    curso: curso.trim(),
    anio: anioFinal,
    rut: normRut,
    perteneceAlmuerzo: Boolean(perteneceAlmuerzo),
    faceDescriptor: Array.isArray(faceDescriptor) ? faceDescriptor : null,
    enrolled: Array.isArray(faceDescriptor) && faceDescriptor.length > 0,
    createdAt: now,
    updatedAt: now,
  };

  const res = await db.collection<StudentDoc>("students").insertOne(doc);
  await linkStudentToCurso(db, res.insertedId, curso.trim());
  // La marca "pertenece almuerzo" se refleja en la Lista almuerzo.
  await syncAllowedRut(db, {
    rut: normRut,
    perteneceAlmuerzo: doc.perteneceAlmuerzo,
    nombre: doc.nombre,
    apellidos: doc.apellidos,
    curso: doc.curso,
  });
  return NextResponse.json({ ok: true, _id: res.insertedId.toString() });
}
