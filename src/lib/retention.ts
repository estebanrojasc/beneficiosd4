import type { Db } from "mongodb";
import { getSettings } from "./settings";
import { logAudit, type ActorType } from "./audit";

// Retención de datos biométricos (Ley 21.719, principio de limitación del plazo
// de conservación). Borra el descriptor facial cuando ya no corresponde
// conservarlo: fin del año escolar (curso de un año anterior) o inactividad
// prolongada. Mantiene el registro del estudiante; solo elimina la biometría.

export interface RetentionResult {
  purged: number;
  ruts: string[];
  criteria: { anioAnterior: boolean; meses: number };
}

export interface RetentionOptions {
  actor: string;
  actorType?: ActorType;
  // Si se entrega, fuerza estos criterios; si no, se leen de Ajustes.
  retencionMeses?: number;
  retencionPurgaAnioAnterior?: boolean;
}

export async function purgeBiometrics(
  db: Db,
  opts: RetentionOptions
): Promise<RetentionResult> {
  const settings = await getSettings(db);
  const meses =
    opts.retencionMeses !== undefined
      ? opts.retencionMeses
      : settings.retencionMeses;
  const anioAnterior =
    opts.retencionPurgaAnioAnterior !== undefined
      ? opts.retencionPurgaAnioAnterior
      : settings.retencionPurgaAnioAnterior;

  const or: Record<string, unknown>[] = [];

  if (anioAnterior) {
    const anioActual = new Date().getFullYear();
    or.push({ anio: { $lt: anioActual } });
  }

  if (meses && meses > 0) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - meses);
    or.push({ updatedAt: { $lt: cutoff.toISOString() } });
  }

  if (or.length === 0) {
    return { purged: 0, ruts: [], criteria: { anioAnterior, meses } };
  }

  // Solo nos interesan estudiantes que efectivamente tengan biometría.
  const filter = {
    faceDescriptor: { $ne: null },
    $or: or,
  };

  const docs = await db
    .collection("students")
    .find(filter)
    .project({ rut: 1 })
    .toArray();

  if (docs.length === 0) {
    return { purged: 0, ruts: [], criteria: { anioAnterior, meses } };
  }

  const now = new Date().toISOString();
  const ids = docs.map((d) => d._id);
  await db.collection("students").updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        faceDescriptor: null,
        enrolled: false,
        biometriaPurgadaAt: now,
        updatedAt: now,
      },
    }
  );

  const ruts = docs.map((d) => d.rut).filter(Boolean);

  // Trazabilidad por titular.
  for (const d of docs) {
    await logAudit(db, {
      action: "retention.purge",
      actor: opts.actor,
      actorType: opts.actorType || "system",
      rut: d.rut,
      studentId: d._id.toString(),
      detail: "Biometría eliminada por política de retención",
      meta: { anioAnterior, meses },
      at: now,
    });
  }

  return { purged: docs.length, ruts, criteria: { anioAnterior, meses } };
}
