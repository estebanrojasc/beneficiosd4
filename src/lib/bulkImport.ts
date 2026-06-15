import type { Db } from "mongodb";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { isValidRut, normalizeRut } from "./rut";
import { generateStructured, type GeminiPart } from "./gemini";
import { isMember, addMember, type ProgramDoc } from "./programs";
import { resolveCursoYear, linkStudentToCurso } from "./cursoServer";
import { syncAllowedRut } from "./allowedRutsServer";
import { buildCursoName, getCicloConfig } from "./curso";
import type { ImportStudent } from "./types";

// Tope de páginas/hojas por archivo: mantiene la extracción precisa y barata.
export const MAX_PAGES = 20;

interface RawStudent {
  nombre?: string;
  apellidos?: string;
  rut?: string;
  curso?: string;
}

// Convierte el valor de una celda de ExcelJS a texto plano legible.
function cellToStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if ("result" in o) return cellToStr(o.result);
    if (Array.isArray(o.richText))
      return (o.richText as { text?: string }[])
        .map((r) => r.text || "")
        .join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("hyperlink" in o && typeof o.hyperlink === "string") return o.hyperlink;
    return "";
  }
  return String(v);
}

// Construye las "parts" para Gemini y calcula la cantidad de páginas/hojas.
export async function extractInput(file: {
  name: string;
  type: string;
  dataBase64: string;
}): Promise<{ parts: GeminiPart[]; pageCount: number }> {
  const bytes = Buffer.from(file.dataBase64, "base64");
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();

  // PDF: se envía directo; contamos páginas para validar el tope.
  if (type === "application/pdf" || name.endsWith(".pdf")) {
    let pageCount = 1;
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pageCount = doc.getPageCount();
    } catch {
      throw new Error("PDF_INVALIDO");
    }
    if (pageCount > MAX_PAGES) throw new Error("DEMASIADAS_PAGINAS");
    return {
      parts: [{ inlineData: { mimeType: "application/pdf", data: file.dataBase64 } }],
      pageCount,
    };
  }

  // Imagen: se envía directo (cuenta como 1 página).
  if (type.startsWith("image/")) {
    return {
      parts: [{ inlineData: { mimeType: type, data: file.dataBase64 } }],
      pageCount: 1,
    };
  }

  // CSV: se decodifica como texto plano directamente.
  if (name.endsWith(".csv") || type === "text/csv") {
    return { parts: [{ text: bytes.toString("utf8") }], pageCount: 1 };
  }

  // Excel (.xlsx): cada hoja se convierte a texto y cuenta como una "página".
  if (
    name.endsWith(".xlsx") ||
    type.includes("spreadsheetml") ||
    type.includes("officedocument.spreadsheet")
  ) {
    const wb = new ExcelJS.Workbook();
    try {
      const ab = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
      await wb.xlsx.load(ab);
    } catch {
      throw new Error("EXCEL_INVALIDO");
    }
    const sheets = wb.worksheets;
    if (sheets.length > MAX_PAGES) throw new Error("DEMASIADAS_PAGINAS");
    const text = sheets
      .map((ws) => {
        const lines: string[] = [];
        ws.eachRow({ includeEmpty: false }, (row) => {
          const vals = (row.values as unknown[]).slice(1).map(cellToStr);
          lines.push(vals.join(";"));
        });
        return `# Hoja: ${ws.name}\n${lines.join("\n")}`;
      })
      .join("\n\n");
    return { parts: [{ text }], pageCount: Math.max(1, sheets.length) };
  }

  // Word: extraemos el texto plano.
  if (
    name.endsWith(".docx") ||
    type.includes("officedocument.wordprocessingml")
  ) {
    const result = await mammoth.extractRawText({ buffer: bytes });
    return { parts: [{ text: result.value || "" }], pageCount: 1 };
  }

  // Texto plano.
  if (type.startsWith("text/") || name.endsWith(".txt")) {
    return { parts: [{ text: bytes.toString("utf8") }], pageCount: 1 };
  }

  throw new Error("FORMATO_NO_SOPORTADO");
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    students: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          nombre: { type: "STRING" },
          apellidos: { type: "STRING" },
          rut: { type: "STRING" },
          curso: { type: "STRING" },
        },
        required: ["nombre"],
      },
    },
  },
  required: ["students"],
};

function buildPrompt(comentario: string): string {
  return [
    "Eres un asistente que extrae listas de estudiantes desde documentos.",
    "Devuelve SOLO los estudiantes encontrados, con estos campos:",
    "- nombre (nombres de pila)",
    "- apellidos",
    "- rut (RUT chileno, con guión y dígito verificador si aparece; si no hay, déjalo vacío)",
    "- curso usando EXACTAMENTE este formato: 'N° Ciclo Letra' (ej. '3° Básico A', '1° Medio B') o 'Ciclo Letra' para los sin número (ej. 'Kínder B', 'Prekínder A'). Ciclos válidos: Prekínder, Kínder, Básico, Medio. Si no aparece en el documento, infiérelo del contexto del usuario.",
    "No inventes RUTs ni nombres. Si un dato no está, déjalo vacío.",
    comentario
      ? `Contexto entregado por el usuario (úsalo para el curso si falta): ${comentario}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Llama a la IA y devuelve la lista cruda extraída.
export async function runExtraction(
  parts: GeminiPart[],
  comentario: string
): Promise<RawStudent[]> {
  const allParts: GeminiPart[] = [{ text: buildPrompt(comentario) }, ...parts];
  const text = await generateStructured(allParts, SCHEMA, { retries: 2 });
  let parsed: { students?: RawStudent[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    // A veces el modelo envuelve el JSON; intentamos recortar.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("IA_RESPUESTA_INVALIDA");
    parsed = JSON.parse(m[0]);
  }
  return Array.isArray(parsed.students) ? parsed.students : [];
}

// Parsea una lista pegada como texto. Cada línea:
//   "RUT;Nombre;Apellidos;Nivel;Ciclo;Letra"  (o solo "RUT").
// Acepta separadores ; , o tabulador. No valida aquí: eso lo hace annotate.
export function parsePastedList(text: string): RawStudent[] {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: RawStudent[] = [];
  for (const line of lines) {
    const parts = line.split(/[;,\t]/).map((s) => s.trim());
    const nivel = parts[3] ? Number(parts[3]) : NaN;
    const ciclo = parts[4] || "";
    const letra = parts[5] || "";
    const conf = getCicloConfig(ciclo);
    const nivelOk = conf
      ? conf.usaNivel
        ? Number.isFinite(nivel)
        : true
      : false;
    const curso =
      conf && nivelOk && letra ? buildCursoName(nivel, ciclo, letra) : "";
    out.push({
      rut: parts[0] || "",
      nombre: parts[1] || "",
      apellidos: parts[2] || "",
      curso,
    });
  }
  return out;
}

// Valida y enriquece cada estudiante extraído.
// - Con programa: yaExiste = ya es miembro de la lista del programa.
// - Sin programa (estudiantes del establecimiento): yaExiste = ya está en la
//   base de estudiantes.
// - enrolado: el estudiante ya tiene cara registrada.
export async function annotateStudents(
  db: Db,
  raw: RawStudent[],
  program?: ProgramDoc | null
): Promise<ImportStudent[]> {
  const norms = raw.map((r) => normalizeRut(r.rut || ""));
  const validNorms = norms.filter((n) => n);

  const students = validNorms.length
    ? await db
        .collection("students")
        .find({ rut: { $in: validNorms } })
        .project({ rut: 1, enrolled: 1 })
        .toArray()
    : [];
  const enrolledMap = new Map(students.map((d) => [d.rut, Boolean(d.enrolled)]));
  const existsSet = new Set(students.map((d) => d.rut));

  const seen = new Set<string>();
  const out: ImportStudent[] = [];
  for (const r of raw) {
    const norm = normalizeRut(r.rut || "");
    const rutValido = Boolean(norm) && isValidRut(norm);
    const yaExiste = !rutValido
      ? false
      : program
      ? await isMember(db, program, norm)
      : existsSet.has(norm);
    const enrolado = rutValido ? Boolean(enrolledMap.get(norm)) : false;
    const dupEnArchivo = rutValido && seen.has(norm);
    if (rutValido) seen.add(norm);
    out.push({
      nombre: (r.nombre || "").trim(),
      apellidos: (r.apellidos || "").trim(),
      rut: norm || (r.rut || "").trim(),
      curso: (r.curso || "").trim(),
      rutValido,
      yaExiste,
      enrolado,
      dupEnArchivo,
      // Por defecto incluimos solo los nuevos, válidos y no repetidos.
      incluir: rutValido && !yaExiste && !dupEnArchivo,
    });
  }
  return out;
}

// Crea una ficha de estudiante (sin cara, enrolled=false) y la vincula a su
// curso. Se usa tanto para la carga global como para la lista de un programa.
async function createStudentRecord(
  db: Db,
  norm: string,
  s: ImportStudent
): Promise<void> {
  const anio = await resolveCursoYear(db, s.curso.trim());
  const now = new Date().toISOString();
  const res = await db.collection("students").insertOne({
    nombre: s.nombre.trim(),
    apellidos: s.apellidos.trim(),
    curso: s.curso.trim(),
    anio,
    rut: norm,
    perteneceAlmuerzo: false,
    faceDescriptor: null,
    enrolled: false,
    createdAt: now,
    updatedAt: now,
  });
  await linkStudentToCurso(db, res.insertedId, s.curso.trim());
  await syncAllowedRut(db, {
    rut: norm,
    perteneceAlmuerzo: false,
    nombre: s.nombre.trim(),
    apellidos: s.apellidos.trim(),
    curso: s.curso.trim(),
  });
}

// Carga los estudiantes seleccionados.
// - Con programa: los agrega a la lista Y crea su ficha de estudiante si no
//   existe (cuando hay nombre + curso). Si falta el curso, queda solo en la
//   lista como "incompleto" (sin ficha) hasta completarlo.
// - Sin programa: crea estudiantes del establecimiento (requiere curso).
// En ningún caso pisa estudiantes ya existentes ni sus caras.
export async function commitStudents(
  db: Db,
  students: ImportStudent[],
  program?: ProgramDoc | null
): Promise<{ created: number; skipped: number; errors: number }> {
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const usados = new Set<string>();

  for (const s of students) {
    if (!s.incluir) {
      skipped++;
      continue;
    }
    const norm = normalizeRut(s.rut);
    // En la carga global el curso es obligatorio; en la lista basta el nombre.
    const faltaCurso = !program && !s.curso.trim();
    if (!norm || !isValidRut(norm) || !s.nombre.trim() || faltaCurso) {
      errors++;
      continue;
    }
    if (usados.has(norm)) {
      skipped++;
      continue;
    }
    usados.add(norm);

    try {
      if (program) {
        const alreadyMember = await isMember(db, program, norm);
        // Asegura la ficha de estudiante (si hay nombre + curso y no existe).
        if (s.nombre.trim() && s.curso.trim()) {
          const exists = await db
            .collection("students")
            .findOne({ rut: norm });
          if (!exists) await createStudentRecord(db, norm, s);
        }
        if (alreadyMember) {
          skipped++;
          continue;
        }
        await addMember(db, program, {
          rut: norm,
          nombre: s.nombre.trim(),
          apellidos: s.apellidos.trim(),
          curso: s.curso.trim(),
        });
        created++;
      } else {
        const exists = await db.collection("students").findOne({ rut: norm });
        if (exists) {
          skipped++;
          continue;
        }
        await createStudentRecord(db, norm, s);
        created++;
      }
    } catch {
      errors++;
    }
  }

  return { created, skipped, errors };
}
