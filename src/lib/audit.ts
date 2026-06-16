import type { Db } from "mongodb";
import type { NextRequest } from "next/server";
import type { SessionPayload } from "./auth";

// Registro de auditoría de acciones sensibles sobre datos biométricos y
// personales (Ley 21.719: trazabilidad de accesos y tratamientos).
//
// SOLO SERVIDOR.

export type AuditAction =
  | "descriptors.download" // descarga del set de descriptores (kiosko)
  | "face.enroll" // se registró una cara (alta)
  | "face.update" // se reemplazó la cara de un estudiante
  | "consent.grant" // se registró la autorización del apoderado
  | "consent.revoke" // se revocó la autorización (borra la cara)
  | "student.delete" // se eliminó un estudiante (supresión)
  | "data.export" // se exportaron los datos de un titular
  | "retention.purge"; // borrado por política de retención

export type ActorType = "admin" | "kiosk" | "public" | "system";

export interface AuditEntry {
  action: AuditAction;
  actor: string; // usuario, "público" o "kiosko:<programa>"
  actorType: ActorType;
  rut?: string; // titular afectado (si aplica)
  studentId?: string;
  detail?: string; // descripción legible
  meta?: Record<string, unknown>;
  ip?: string;
  at: string; // ISO
}

// Deriva el actor a partir de la sesión (si la hay).
export function actorFromSession(session: SessionPayload | null): {
  actor: string;
  actorType: ActorType;
} {
  if (session) return { actor: session.username, actorType: "admin" };
  return { actor: "público", actorType: "public" };
}

// Mejor esfuerzo para obtener la IP del solicitante (detrás de proxy).
export function ipFromRequest(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "";
}

// Inserta un registro de auditoría. Nunca lanza: la auditoría no debe romper la
// operación principal (se registra el error en consola y se sigue).
export async function logAudit(
  db: Db,
  entry: Omit<AuditEntry, "at"> & { at?: string }
): Promise<void> {
  try {
    await db.collection("audit_logs").insertOne({
      ...entry,
      at: entry.at || new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[audit] No se pudo registrar el evento de auditoría.", err);
  }
}

export interface AuditQuery {
  action?: string;
  rut?: string;
  limit?: number;
  skip?: number;
}

// Lista registros de auditoría (más recientes primero) con paginación simple.
export async function listAudit(
  db: Db,
  q: AuditQuery
): Promise<{ items: AuditEntry[]; total: number; hasMore: boolean }> {
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = q.action;
  if (q.rut) filter.rut = q.rut;

  const limit = Math.min(Math.max(1, q.limit ?? 50), 200);
  const skip = Math.max(0, q.skip ?? 0);

  const coll = db.collection("audit_logs");
  const [total, docs] = await Promise.all([
    coll.countDocuments(filter),
    coll.find(filter).sort({ at: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  const items = docs.map((d) => ({
    action: d.action,
    actor: d.actor,
    actorType: d.actorType,
    rut: d.rut,
    studentId: d.studentId,
    detail: d.detail,
    meta: d.meta,
    ip: d.ip,
    at: d.at,
  })) as AuditEntry[];

  return { items, total, hasMore: skip + docs.length < total };
}
