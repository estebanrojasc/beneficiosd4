import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getProgram, temporalReport, puntualReport, toPublicProgram } from "@/lib/programs";

// Reporte del programa según su modalidad:
//  - temporal: grilla mensual de asistencia + porcentajes.
//  - puntual: entregados vs pendientes.
export async function GET(
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

  const program = toPublicProgram(p);

  if (p.modalidad === "puntual") {
    const data = await puntualReport(db, p);
    return NextResponse.json({ program, modalidad: "puntual", ...data });
  }

  const month = req.nextUrl.searchParams.get("month") || undefined;
  const data = await temporalReport(db, p, month || "");
  return NextResponse.json({ program, modalidad: "temporal", ...data });
}
