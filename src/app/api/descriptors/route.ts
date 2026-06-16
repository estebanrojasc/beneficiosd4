import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { fullName } from "@/lib/curso";
import { getProgramByValidadorClave, memberRuts } from "@/lib/programs";
import { decryptDescriptor } from "@/lib/crypto";
import { logAudit, ipFromRequest } from "@/lib/audit";

// Entrega los descriptores de los estudiantes para que el kiosko pueda
// reconocer caras (incluso sin internet, se cachean cifrados en el dispositivo).
//
// Acceso: sesión de admin (recibe todos) o la clave de validador de un programa.
// Minimización de datos: si el programa exige lista (requiereMembresia), solo se
// entregan los descriptores de sus miembros; no toda la base biométrica.
export async function GET(req: NextRequest) {
  const session = await getSession();
  const token =
    req.headers.get("x-kiosk-token") ||
    req.nextUrl.searchParams.get("token") ||
    "";

  const db = await getDb();
  const program = token ? await getProgramByValidadorClave(db, token) : null;

  if (!session && !program) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Construimos el filtro acotado al programa cuando corresponde.
  const filter: Record<string, unknown> = {
    enrolled: true,
    faceDescriptor: { $ne: null },
  };

  let scoped = false;
  if (program && program.requiereMembresia) {
    const ruts = await memberRuts(db, program);
    filter.rut = { $in: Array.from(ruts) };
    scoped = true;
  }

  const docs = await db
    .collection("students")
    .find(filter)
    .project({
      rut: 1,
      nombre: 1,
      apellidos: 1,
      curso: 1,
      perteneceAlmuerzo: 1,
      faceDescriptor: 1,
    })
    .toArray();

  const entries = docs
    .map((d) => {
      const descriptor = decryptDescriptor(d.faceDescriptor);
      if (!descriptor) return null;
      return {
        rut: d.rut,
        nombre: fullName(d.nombre, d.apellidos),
        curso: d.curso,
        perteneceAlmuerzo: d.perteneceAlmuerzo,
        descriptor,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  // Auditoría: queda registro de quién descargó descriptores biométricos.
  await logAudit(db, {
    action: "descriptors.download",
    actor: program ? `kiosko:${program.nombre}` : session?.username || "admin",
    actorType: program ? "kiosk" : "admin",
    detail: program
      ? `Descarga de ${entries.length} descriptores para "${program.nombre}"` +
        (scoped ? " (acotado a la lista del programa)" : " (todos los enrolados)")
      : `Descarga de ${entries.length} descriptores (sesión admin)`,
    meta: {
      count: entries.length,
      scoped,
      programId: program?._id.toString(),
    },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ entries, count: entries.length });
}
