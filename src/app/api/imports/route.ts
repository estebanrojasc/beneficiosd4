import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { geminiConfigured } from "@/lib/gemini";
import { getProgram } from "@/lib/programs";
import {
  extractInput,
  runExtraction,
  annotateStudents,
  parsePastedList,
  MAX_PAGES,
} from "@/lib/bulkImport";

// La extracción con IA puede tardar varios segundos: ampliamos el límite.
export const runtime = "nodejs";
export const maxDuration = 60;

// Clave del scope "estudiantes del establecimiento" (no es un programa).
const STUDENTS_SCOPE = "__students__";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(doc: any) {
  return {
    _id: String(doc._id),
    status: doc.status,
    scope: doc.scope || "programa",
    programId: doc.programId || "",
    fileName: doc.fileName || "",
    source: doc.source || "archivo",
    comentario: doc.comentario || "",
    pageCount: doc.pageCount || 0,
    students: doc.students || [],
    summary: doc.summary,
    error: doc.error,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
  };
}

// Devuelve el proceso activo (en revisión) de un programa, si existe.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const scope = req.nextUrl.searchParams.get("scope") || "";
  const programId =
    scope === "estudiantes"
      ? STUDENTS_SCOPE
      : req.nextUrl.searchParams.get("programId") || "";
  const db = await getDb();
  const active = await db
    .collection("bulk_imports")
    .findOne({ status: "review", programId });
  return NextResponse.json({ job: active ? serialize(active) : null });
}

// Crea un proceso: extrae con IA y deja el job en "revisión".
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const db = await getDb();

  const body = await req.json().catch(() => ({}));
  const { scope, programId, fileName, fileType, dataBase64, comentario, pasted } =
    body as {
      scope?: string;
      programId?: string;
      fileName?: string;
      fileType?: string;
      dataBase64?: string;
      comentario?: string;
      pasted?: string;
    };

  const isPaste = typeof pasted === "string" && pasted.trim().length > 0;

  if (!isPaste) {
    // La extracción desde archivo usa IA: requiere configuración.
    if (!geminiConfigured())
      return NextResponse.json(
        {
          error: "GEMINI_NOT_CONFIGURED",
          message:
            "Falta configurar GEMINI_API_KEY en el servidor para usar la carga con IA.",
        },
        { status: 503 }
      );
    if (!dataBase64)
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }

  const isStudents = scope === "estudiantes";
  let program = null;
  let pid = STUDENTS_SCOPE;
  if (!isStudents) {
    if (!programId)
      return NextResponse.json({ error: "Falta el programa" }, { status: 400 });
    program = await getProgram(db, programId);
    if (!program)
      return NextResponse.json(
        { error: "Programa no encontrado" },
        { status: 404 }
      );
    pid = program._id.toString();
  }

  // Solo un proceso a la vez por destino (programa o estudiantes).
  const active = await db
    .collection("bulk_imports")
    .findOne({ status: "review", programId: pid });
  if (active)
    return NextResponse.json(
      {
        error: "PROCESO_ACTIVO",
        message: isStudents
          ? "Ya hay un proceso de carga de estudiantes en revisión. Ciérralo para iniciar otro."
          : "Ya hay un proceso de carga en revisión para este programa. Ciérralo para iniciar otro.",
        job: serialize(active),
      },
      { status: 409 }
    );

  let students;
  let pageCount = 0;

  if (isPaste) {
    // Lista pegada: parseamos el texto y validamos (mismo formato del manual).
    const raw = parsePastedList(pasted as string);
    if (raw.length === 0)
      return NextResponse.json(
        { error: "VACIO", message: "No hay líneas para importar." },
        { status: 400 }
      );
    students = await annotateStudents(db, raw, program);
  } else {
    // 1) Extraer parts + validar páginas.
    let parts;
    try {
      const r = await extractInput({
        name: fileName || "archivo",
        type: fileType || "",
        dataBase64: dataBase64 as string,
      });
      parts = r.parts;
      pageCount = r.pageCount;
    } catch (err) {
      const code = err instanceof Error ? err.message : "ERROR";
      const msg =
        code === "DEMASIADAS_PAGINAS"
          ? `El archivo supera el máximo de ${MAX_PAGES} páginas/hojas. Divídelo y vuelve a intentar.`
          : code === "FORMATO_NO_SOPORTADO"
          ? "Formato no soportado. Usa PDF, imagen, Excel, Word o texto."
          : code === "PDF_INVALIDO"
          ? "No se pudo leer el PDF. Puede estar dañado o protegido."
          : code === "EXCEL_INVALIDO"
          ? "No se pudo leer el Excel. Usa formato .xlsx (no .xls antiguo)."
          : "No se pudo leer el archivo.";
      return NextResponse.json({ error: code, message: msg }, { status: 400 });
    }

    // 2) IA (con reintentos internos). Si falla, el cliente puede reintentar.
    try {
      const raw = await runExtraction(parts, comentario || "");
      students = await annotateStudents(db, raw, program);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ERROR";
      return NextResponse.json(
        {
          error: "IA_ERROR",
          message:
            "La IA no respondió o tuvo un error (a veces el servicio gratuito no está disponible). Reintenta.",
          detail: msg,
        },
        { status: 502 }
      );
    }
  }

  // 3) Guardar el job en revisión.
  const now = new Date().toISOString();
  const doc = {
    status: "review" as const,
    scope: isStudents ? "estudiantes" : "programa",
    source: isPaste ? "texto" : "archivo",
    programId: pid,
    fileName: isPaste ? "Lista pegada" : fileName || "archivo",
    comentario: comentario || "",
    pageCount,
    students,
    createdAt: now,
    updatedAt: now,
    createdBy: session.username,
  };
  const res = await db.collection("bulk_imports").insertOne(doc);
  return NextResponse.json({ job: serialize({ ...doc, _id: res.insertedId }) });
}
