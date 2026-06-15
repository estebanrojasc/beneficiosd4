import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import crypto from "node:crypto";
import type { Program, ProgramModalidad } from "./types";
import { dateInTZ, monthInTZ } from "./date";
import { fullName } from "./curso";
// El almuerzo es un programa "especial": para no duplicar datos ni perder las
// pantallas ya pulidas, su lista y registros se delegan a las colecciones
// históricas (allowedRuts + attendance). El resto de programas usa las nuevas
// colecciones genéricas (program_members + program_records).
export const ALMUERZO_SLUG = "almuerzo";

export interface ProgramDoc {
  _id: ObjectId;
  nombre: string;
  descripcion?: string;
  modalidad: ProgramModalidad;
  estado: "activo" | "cerrado";
  icono: string;
  color: string;
  requiereMembresia: boolean;
  permitirAutoRegistro: boolean;
  qrToken: string;
  qrVentanaMin: number;
  qrOpenAt?: string | null;
  validadorClave: string;
  umbralAsistencia: number;
  slug?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export function randomToken(): string {
  return crypto.randomBytes(9).toString("base64url");
}

// Clave corta y legible para escribir en una tablet (ej. "K7M2QX").
export function shortKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// Convierte un nombre en un texto simple para URLs (sin tildes ni símbolos).
export function slugify(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Clave cercana basada en el nombre y el año (ej. "materiales2026").
export function claveFromName(nombre: string, year: number): string {
  const base = slugify(nombre).replace(/-/g, "").slice(0, 18);
  return `${base || "programa"}${year}`;
}

// ¿Existe ya un programa con ese nombre? (ignora mayúsculas/espacios).
export async function nameExists(
  db: Db,
  nombre: string,
  exceptId?: string
): Promise<boolean> {
  const rx = new RegExp(
    `^\\s*${nombre.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
    "i"
  );
  const q: Record<string, unknown> = { nombre: rx };
  if (exceptId && ObjectId.isValid(exceptId))
    q._id = { $ne: new ObjectId(exceptId) };
  const doc = await db.collection("programs").findOne(q, { projection: { _id: 1 } });
  return Boolean(doc);
}

// Genera un slug único para el link del validador (ej. "almuerzo-2026").
export async function uniqueSlug(db: Db, nombre: string): Promise<string> {
  const year = new Date().getFullYear();
  const base = `${slugify(nombre) || "programa"}-${year}`;
  let candidate = base;
  let n = 2;
  while (await db.collection("programs").findOne({ slug: candidate })) {
    candidate = `${base}-${n++}`;
  }
  return candidate;
}

export function toPublicProgram(doc: ProgramDoc): Program {
  return {
    _id: doc._id.toString(),
    nombre: doc.nombre,
    descripcion: doc.descripcion || "",
    modalidad: doc.modalidad,
    estado: doc.estado,
    icono: doc.icono || "🗂️",
    color: doc.color || "#4f7cff",
    requiereMembresia: doc.requiereMembresia,
    permitirAutoRegistro: Boolean(doc.permitirAutoRegistro),
    qrToken: doc.qrToken,
    qrVentanaMin: doc.qrVentanaMin ?? 0,
    qrOpenAt: doc.qrOpenAt ?? null,
    validadorClave: doc.validadorClave || "",
    umbralAsistencia: doc.umbralAsistencia ?? 70,
    slug: doc.slug,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
  };
}

export async function listPrograms(db: Db): Promise<Program[]> {
  // Sin programas precargados: el administrador crea todo desde cero.
  await backfillPrograms(db);
  const docs = await db
    .collection<ProgramDoc>("programs")
    .find({})
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toPublicProgram);
}

// Completa slug y clave de validador en programas creados antes de estos campos.
async function backfillPrograms(db: Db): Promise<void> {
  const coll = db.collection("programs");
  const pending = await coll
    .find({
      $or: [
        { slug: { $in: [null, ""] } },
        { slug: { $exists: false } },
        { validadorClave: { $in: [null, ""] } },
        { validadorClave: { $exists: false } },
      ],
    })
    .toArray();
  const year = new Date().getFullYear();
  for (const p of pending) {
    const patch: Record<string, unknown> = {};
    if (!p.slug) patch.slug = await uniqueSlug(db, p.nombre);
    if (!p.validadorClave) patch.validadorClave = claveFromName(p.nombre, year);
    if (Object.keys(patch).length)
      await coll.updateOne({ _id: p._id }, { $set: patch });
  }
}

// Resuelve un programa por su ObjectId o por su slug (link del validador).
export async function getProgram(
  db: Db,
  idOrSlug: string
): Promise<ProgramDoc | null> {
  const coll = db.collection<ProgramDoc>("programs");
  if (ObjectId.isValid(idOrSlug)) {
    const byId = await coll.findOne({ _id: new ObjectId(idOrSlug) });
    if (byId) return byId;
  }
  return coll.findOne({ slug: idOrSlug });
}

export async function getProgramByToken(
  db: Db,
  token: string
): Promise<ProgramDoc | null> {
  if (!token) return null;
  return db.collection<ProgramDoc>("programs").findOne({ qrToken: token });
}

// Resuelve un programa a partir de la clave del validador (la que se escribe
// en la página principal para validar ese programa).
export async function getProgramByValidadorClave(
  db: Db,
  clave: string
): Promise<ProgramDoc | null> {
  const c = (clave || "").trim();
  if (!c) return null;
  return db.collection<ProgramDoc>("programs").findOne({ validadorClave: c });
}

function isAlmuerzo(p: ProgramDoc): boolean {
  return p.slug === ALMUERZO_SLUG;
}

// ¿Está abierta la ventana de auto-registro por QR?
//  - programa cerrado: nunca.
//  - qrVentanaMin = 0: siempre abierto (mientras el programa esté activo).
//  - qrVentanaMin > 0: abierto solo si el admin lo abrió y no expiró.
export function registrationStatus(p: ProgramDoc): {
  open: boolean;
  expiresAt: string | null;
} {
  if (p.estado !== "activo") return { open: false, expiresAt: null };
  // El auto-registro por QR debe estar habilitado para este programa.
  if (!p.permitirAutoRegistro) return { open: false, expiresAt: null };
  if (!p.qrVentanaMin || p.qrVentanaMin <= 0)
    return { open: true, expiresAt: null };
  if (!p.qrOpenAt) return { open: false, expiresAt: null };
  const expires = new Date(p.qrOpenAt).getTime() + p.qrVentanaMin * 60_000;
  return { open: Date.now() < expires, expiresAt: new Date(expires).toISOString() };
}

// Valida una clave de kiosko: la global (KIOSK_TOKEN) o la propia de algún
// programa. Se usa para los descriptores (caras), que son globales.
export async function isKioskTokenValid(
  db: Db,
  token: string
): Promise<boolean> {
  if (!token) return false;
  if (token === (process.env.KIOSK_TOKEN || "kiosko2026")) return true;
  const doc = await db
    .collection("programs")
    .findOne({ validadorClave: token }, { projection: { _id: 1 } });
  return Boolean(doc);
}

// ¿La clave/sesión autoriza a operar el validador de ESTE programa?
export function programValidadorAuthorized(
  p: ProgramDoc,
  token: string,
  hasSession: boolean
): boolean {
  if (hasSession) return true;
  if (!token) return false;
  if (token === (process.env.KIOSK_TOKEN || "kiosko2026")) return true;
  return token === p.validadorClave;
}

// --- Miembros ----------------------------------------------------------------

export interface MemberView {
  rut: string;
  nombre: string;
  apellidos: string;
  curso: string;
}

export async function listMembers(
  db: Db,
  p: ProgramDoc
): Promise<MemberView[]> {
  const coll = isAlmuerzo(p) ? "allowedRuts" : "program_members";
  const filter = isAlmuerzo(p) ? {} : { programId: p._id.toString() };
  const docs = await db
    .collection(coll)
    .find(filter)
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1 })
    .toArray();
  return docs.map((d) => ({
    rut: d.rut,
    nombre: d.nombre || "",
    apellidos: d.apellidos || "",
    curso: d.curso || "",
  }));
}

export async function memberRuts(db: Db, p: ProgramDoc): Promise<Set<string>> {
  const coll = isAlmuerzo(p) ? "allowedRuts" : "program_members";
  const filter = isAlmuerzo(p) ? {} : { programId: p._id.toString() };
  const docs = await db
    .collection(coll)
    .find(filter)
    .project({ rut: 1 })
    .toArray();
  return new Set(docs.map((d) => d.rut));
}

export async function isMember(
  db: Db,
  p: ProgramDoc,
  rut: string
): Promise<boolean> {
  const coll = isAlmuerzo(p) ? "allowedRuts" : "program_members";
  const filter = isAlmuerzo(p)
    ? { rut }
    : { programId: p._id.toString(), rut };
  const doc = await db.collection(coll).findOne(filter);
  return Boolean(doc);
}

export async function addMember(
  db: Db,
  p: ProgramDoc,
  m: { rut: string; nombre?: string; apellidos?: string; curso?: string }
): Promise<void> {
  const now = new Date().toISOString();
  const set: Record<string, string> = {};
  if (m.nombre) set.nombre = m.nombre.trim();
  if (m.apellidos) set.apellidos = m.apellidos.trim();
  if (m.curso) set.curso = m.curso.trim();

  if (isAlmuerzo(p)) {
    const update: Record<string, unknown> = {
      $setOnInsert: { rut: m.rut, createdAt: now },
    };
    if (Object.keys(set).length > 0) update.$set = set;
    await db
      .collection("allowedRuts")
      .updateOne({ rut: m.rut }, update, { upsert: true });
    return;
  }
  const update: Record<string, unknown> = {
    $setOnInsert: { programId: p._id.toString(), rut: m.rut, createdAt: now },
  };
  if (Object.keys(set).length > 0) update.$set = set;
  await db
    .collection("program_members")
    .updateOne(
      { programId: p._id.toString(), rut: m.rut },
      update,
      { upsert: true }
    );
}

export async function removeMember(
  db: Db,
  p: ProgramDoc,
  rut: string
): Promise<void> {
  if (isAlmuerzo(p)) {
    await db.collection("allowedRuts").deleteOne({ rut });
    return;
  }
  await db
    .collection("program_members")
    .deleteOne({ programId: p._id.toString(), rut });
}

// --- Registros (asistencia/entrega) ------------------------------------------

export interface MarkResult {
  ok: boolean;
  duplicate: boolean;
}

// Registra una marca. Respeta la modalidad:
//  - temporal: una marca por persona por día.
//  - puntual: una sola marca por persona en todo el programa.
export async function markRecord(
  db: Db,
  p: ProgramDoc,
  rec: {
    rut: string;
    nombre: string;
    curso: string;
    method: "facial" | "manual" | "qr";
    by?: string;
    timestamp?: string;
  }
): Promise<MarkResult> {
  const fecha = dateInTZ();
  const timestamp = rec.timestamp || new Date().toISOString();

  if (isAlmuerzo(p)) {
    const existing = await db
      .collection("attendance")
      .findOne({ fecha, "records.rut": rec.rut });
    if (existing) return { ok: true, duplicate: true };
    const record = {
      rut: rec.rut,
      nombre: rec.nombre || "",
      curso: rec.curso || "",
      method: rec.method === "manual" ? "manual" : "facial",
      timestamp,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = {
      $setOnInsert: { fecha, createdAt: new Date().toISOString() },
      $set: { updatedAt: new Date().toISOString() },
      $push: { records: record },
    };
    await db
      .collection("attendance")
      .updateOne({ fecha }, update, { upsert: true });
    return { ok: true, duplicate: false };
  }

  const programId = p._id.toString();
  const dupFilter =
    p.modalidad === "puntual"
      ? { programId, rut: rec.rut }
      : { programId, rut: rec.rut, fecha };
  const existing = await db.collection("program_records").findOne(dupFilter);
  if (existing) return { ok: true, duplicate: true };

  await db.collection("program_records").insertOne({
    programId,
    rut: rec.rut,
    nombre: rec.nombre || "",
    curso: rec.curso || "",
    fecha,
    timestamp,
    method: rec.method,
    by: rec.by,
  });
  return { ok: true, duplicate: false };
}

// RUTs ya registrados (para el kiosko): hoy si es temporal, históricos si es puntual.
export async function registeredRuts(
  db: Db,
  p: ProgramDoc,
  fecha?: string
): Promise<string[]> {
  const day = fecha || dateInTZ();
  if (isAlmuerzo(p)) {
    const doc = await db.collection("attendance").findOne({ fecha: day });
    return Array.isArray(doc?.records)
      ? doc!.records.map((r: { rut: string }) => r.rut)
      : [];
  }
  const programId = p._id.toString();
  const filter =
    p.modalidad === "puntual"
      ? { programId }
      : { programId, fecha: day };
  const docs = await db
    .collection("program_records")
    .find(filter)
    .project({ rut: 1 })
    .toArray();
  return docs.map((d) => d.rut);
}

// --- Reportes ----------------------------------------------------------------

export interface TemporalReportStudent {
  rut: string;
  nombre: string;
  curso: string;
  attended: string[];
  count: number;
  percentage: number;
}

export interface TemporalCourseSummary {
  curso: string;
  total: number;
  promedio: number;
  bajoUmbral: number;
}

export async function temporalReport(
  db: Db,
  p: ProgramDoc,
  month: string
): Promise<{
  month: string;
  days: string[];
  serviceDays: number;
  umbral: number;
  students: TemporalReportStudent[];
  courseSummary: TemporalCourseSummary[];
}> {
  const m = (month || monthInTZ()).slice(0, 7);

  // Días con servicio y asistencia por RUT.
  const serviceDays: string[] = [];
  const attendedByRut = new Map<string, Set<string>>();

  if (isAlmuerzo(p)) {
    const days = await db
      .collection("attendance")
      .find({ fecha: { $regex: `^${m}` } })
      .sort({ fecha: 1 })
      .toArray();
    for (const day of days) {
      const records: { rut: string }[] = Array.isArray(day.records)
        ? day.records
        : [];
      if (records.length > 0) serviceDays.push(day.fecha);
      for (const r of records) {
        if (!r.rut) continue;
        if (!attendedByRut.has(r.rut)) attendedByRut.set(r.rut, new Set());
        attendedByRut.get(r.rut)!.add(day.fecha);
      }
    }
  } else {
    const recs = await db
      .collection("program_records")
      .find({ programId: p._id.toString(), fecha: { $regex: `^${m}` } })
      .toArray();
    const daySet = new Set<string>();
    for (const r of recs) {
      daySet.add(r.fecha);
      if (!attendedByRut.has(r.rut)) attendedByRut.set(r.rut, new Set());
      attendedByRut.get(r.rut)!.add(r.fecha);
    }
    serviceDays.push(...Array.from(daySet).sort());
  }

  const roster = await rosterFor(db, p);
  const totalService = serviceDays.length;
  const students: TemporalReportStudent[] = roster.map((r) => {
    const attended = Array.from(attendedByRut.get(r.rut) || []).sort();
    const count = attended.length;
    const percentage =
      totalService > 0 ? Math.round((count / totalService) * 100) : 0;
    return { rut: r.rut, nombre: r.nombre, curso: r.curso, attended, count, percentage };
  });
  sortByCursoNombre(students);
  const umbral = p.umbralAsistencia;
  const courseSummary = buildTemporalCourseSummary(students, umbral);

  return {
    month: m,
    days: serviceDays,
    serviceDays: totalService,
    umbral,
    students,
    courseSummary,
  };
}

export interface PuntualReportStudent {
  rut: string;
  nombre: string;
  curso: string;
  delivered: boolean;
  fecha?: string;
}

export interface PuntualCourseSummary {
  curso: string;
  total: number;
  entregados: number;
}

export async function puntualReport(
  db: Db,
  p: ProgramDoc
): Promise<{
  students: PuntualReportStudent[];
  deliveredCount: number;
  total: number;
  courseSummary: PuntualCourseSummary[];
}> {
  const roster = await rosterFor(db, p);
  const recs = await db
    .collection("program_records")
    .find({ programId: p._id.toString() })
    .project({ rut: 1, fecha: 1 })
    .toArray();
  const byRut = new Map(recs.map((r) => [r.rut, r.fecha as string]));

  const students: PuntualReportStudent[] = roster.map((r) => ({
    rut: r.rut,
    nombre: r.nombre,
    curso: r.curso,
    delivered: byRut.has(r.rut),
    fecha: byRut.get(r.rut),
  }));
  sortByCursoNombre(students);
  const courseSummary = buildPuntualCourseSummary(students);

  return {
    students,
    deliveredCount: students.filter((s) => s.delivered).length,
    total: students.length,
    courseSummary,
  };
}

// Roster del programa: sus miembros, o todos los enrolados si no requiere lista.
async function rosterFor(
  db: Db,
  p: ProgramDoc
): Promise<{ rut: string; nombre: string; curso: string }[]> {
  const projection = { rut: 1, nombre: 1, apellidos: 1, curso: 1, enrolled: 1 };

  if (p.requiereMembresia) {
    const members = await listMembers(db, p);
    if (members.length === 0) return [];
    const memberByRut = new Map(members.map((m) => [m.rut, m]));
    const ruts = members.map((m) => m.rut);
    const studentDocs = await db
      .collection("students")
      .find({ rut: { $in: ruts } })
      .project(projection)
      .toArray();
    const studentByRut = new Map(studentDocs.map((s) => [s.rut, s]));
    return ruts.map((rut) => {
      const s = studentByRut.get(rut);
      const m = memberByRut.get(rut);
      return {
        rut,
        nombre:
          fullName(
            (s?.nombre || m?.nombre || "") as string,
            (s?.apellidos || m?.apellidos || "") as string
          ) || "Sin nombre",
        curso: (s?.curso || m?.curso || "") as string,
      };
    });
  }

  const studentDocs = await db
    .collection("students")
    .find({ enrolled: true })
    .project(projection)
    .toArray();
  return studentDocs.map((s) => ({
    rut: s.rut as string,
    nombre: fullName(s.nombre || "", s.apellidos || "") || "Sin nombre",
    curso: (s.curso || "") as string,
  }));
}

function buildTemporalCourseSummary(
  students: TemporalReportStudent[],
  umbral: number
): TemporalCourseSummary[] {
  const byCurso = new Map<string, TemporalReportStudent[]>();
  for (const s of students) {
    const key = s.curso || "Sin curso";
    const arr = byCurso.get(key) || [];
    arr.push(s);
    byCurso.set(key, arr);
  }
  const summary = Array.from(byCurso.entries()).map(([curso, list]) => {
    const total = list.length;
    const promedio =
      total > 0
        ? Math.round(list.reduce((sum, s) => sum + s.percentage, 0) / total)
        : 0;
    const bajoUmbral = list.filter((s) => s.percentage < umbral).length;
    return { curso, total, promedio, bajoUmbral };
  });
  sortCourseSummary(summary);
  return summary;
}

function buildPuntualCourseSummary(
  students: PuntualReportStudent[]
): PuntualCourseSummary[] {
  const byCurso = new Map<string, PuntualReportStudent[]>();
  for (const s of students) {
    const key = s.curso || "Sin curso";
    const arr = byCurso.get(key) || [];
    arr.push(s);
    byCurso.set(key, arr);
  }
  const summary = Array.from(byCurso.entries()).map(([curso, list]) => ({
    curso,
    total: list.length,
    entregados: list.filter((s) => s.delivered).length,
  }));
  sortCourseSummary(summary);
  return summary;
}

function sortCourseSummary<T extends { curso: string }>(arr: T[]) {
  arr.sort((a, b) => {
    if (a.curso === "Sin curso") return 1;
    if (b.curso === "Sin curso") return -1;
    return a.curso.localeCompare(b.curso, "es", { numeric: true });
  });
}

function sortByCursoNombre(arr: { curso: string; nombre: string }[]) {
  arr.sort((x, y) => {
    const cx = x.curso || "zzz";
    const cy = y.curso || "zzz";
    const byCurso = cx.localeCompare(cy, "es", { numeric: true });
    if (byCurso !== 0) return byCurso;
    return x.nombre.localeCompare(y.nombre, "es");
  });
}
