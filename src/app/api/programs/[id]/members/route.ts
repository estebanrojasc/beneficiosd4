import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { buildCursoName, getCicloConfig } from "@/lib/curso";
import {
  getProgram,
  listMembers,
  addMember,
  removeMember,
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

// Lista de miembros del programa, enriquecida con el estado de enrolamiento.
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

  const members = await listMembers(db, p);
  const ruts = members.map((m) => m.rut);
  const students = await db
    .collection("students")
    .find({ rut: { $in: ruts } })
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1, enrolled: 1 })
    .toArray();
  const byRut = new Map(students.map((s) => [s.rut, s]));

  return NextResponse.json(
    members.map((m) => {
      const s = byRut.get(m.rut);
      return {
        rut: m.rut,
        nombre: m.nombre || s?.nombre || "",
        apellidos: m.apellidos || s?.apellidos || "",
        curso: s?.curso || m.curso || "",
        enrolled: Boolean(s?.enrolled),
      };
    })
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const p = await getProgram(db, id);
  if (!p)
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Carga masiva: líneas "RUT;Nombre;Apellidos;Nivel;Ciclo;Letra" o solo "RUT".
  if (typeof body.bulk === "string") {
    const lines = body.bulk
      .split(/\r?\n/)
      .map((l: string) => l.trim())
      .filter(Boolean);
    let added = 0;
    let invalid = 0;
    for (const line of lines) {
      const parts = line.split(/[;,\t]/).map((s: string) => s.trim());
      if (!isValidRut(parts[0])) {
        invalid++;
        continue;
      }
      const nivel = parts[3] ? Number(parts[3]) : NaN;
      const ciclo = parts[4] || "";
      const letra = parts[5] || "";
      const conf = getCicloConfig(ciclo);
      const nivelOk = conf ? (conf.usaNivel ? Number.isFinite(nivel) : true) : false;
      const curso = conf && nivelOk && letra ? buildCursoName(nivel, ciclo, letra) : "";
      await addMember(db, p, {
        rut: normalizeRut(parts[0]),
        nombre: parts[1] || "",
        apellidos: parts[2] || "",
        curso,
      });
      added++;
    }
    return NextResponse.json({ ok: true, added, invalid });
  }

  // Alta individual.
  if (!body.rut || !isValidRut(body.rut))
    return NextResponse.json({ error: "RUT inválido" }, { status: 400 });
  const rut = normalizeRut(body.rut);
  if (await isMember(db, p, rut))
    return NextResponse.json(
      { error: "DUPLICADO", message: "Ese RUT ya está en la lista." },
      { status: 409 }
    );
  await addMember(db, p, {
    rut,
    nombre: body.nombre,
    apellidos: body.apellidos,
    curso: body.curso,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const rut = req.nextUrl.searchParams.get("rut");
  if (!rut)
    return NextResponse.json({ error: "Falta el RUT" }, { status: 400 });

  const db = await getDb();
  const p = await getProgram(db, id);
  if (!p)
    return NextResponse.json({ error: "Programa no encontrado" }, { status: 404 });
  await removeMember(db, p, normalizeRut(rut));
  return NextResponse.json({ ok: true });
}
