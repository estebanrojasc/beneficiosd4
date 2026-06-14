import type { Db } from "mongodb";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { isValidRut, normalizeRut } from "./rut";
import { generateStructured, type GeminiPart } from "./gemini";
import { isMember, addMember, type ProgramDoc } from "./programs";
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
    "- curso (ej. '1°A Básico', 'Kínder B'; si no aparece en el documento, infiérelo del contexto del usuario)",
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

// Valida y enriquece cada estudiante para agregarlo a la lista de un programa.
// - yaExiste: el RUT ya está en la lista (miembro) del programa.
// - enrolado: el estudiante ya tiene cara registrada en la base.
export async function annotateStudents(
  db: Db,
  program: ProgramDoc,
  raw: RawStudent[]
): Promise<ImportStudent[]> {
  const norms = raw.map((r) => normalizeRut(r.rut || ""));
  const validNorms = norms.filter((n) => n);

  // Estado de enrolamiento (cara) según la base de estudiantes.
  const students = validNorms.length
    ? await db
        .collection("students")
        .find({ rut: { $in: validNorms } })
        .project({ rut: 1, enrolled: 1 })
        .toArray()
    : [];
  const enrolledMap = new Map(students.map((d) => [d.rut, Boolean(d.enrolled)]));

  const seen = new Set<string>();
  const out: ImportStudent[] = [];
  for (const r of raw) {
    const norm = normalizeRut(r.rut || "");
    const rutValido = Boolean(norm) && isValidRut(norm);
    const yaExiste = rutValido ? await isMember(db, program, norm) : false;
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

// Agrega los estudiantes seleccionados a la lista del programa. No toca a los
// que ya son miembros (no pisa datos ni caras). Devuelve un resumen.
export async function commitStudents(
  db: Db,
  program: ProgramDoc,
  students: ImportStudent[]
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
    if (!norm || !isValidRut(norm) || !s.nombre.trim()) {
      errors++;
      continue;
    }
    if (usados.has(norm)) {
      skipped++;
      continue;
    }
    usados.add(norm);

    if (await isMember(db, program, norm)) {
      skipped++;
      continue;
    }

    try {
      await addMember(db, program, {
        rut: norm,
        nombre: s.nombre.trim(),
        apellidos: s.apellidos.trim(),
        curso: s.curso.trim(),
      });
      created++;
    } catch {
      errors++;
    }
  }

  return { created, skipped, errors };
}
