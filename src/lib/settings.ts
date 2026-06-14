import type { Db } from "mongodb";

// Configuración global del establecimiento (documento único).
const SETTINGS_KEY = "config";

export interface AppSettings {
  enrolamientoAbierto: boolean;
  // Umbral (%) bajo el cual se considera "baja asistencia al almuerzo".
  umbralAsistencia: number;
  // Similitud coseno (0–1) sobre la cual se considera que dos caras son la
  // MISMA persona. Más alto = más estricto (deja pasar gemelos/hermanos).
  umbralCaraDuplicada: number;
}

const DEFAULT_UMBRAL = 70;
const DEFAULT_UMBRAL_CARA = 0.75;

export async function getSettings(db: Db): Promise<AppSettings> {
  const doc = await db.collection("settings").findOne({ key: SETTINGS_KEY });
  const umbral = Number(doc?.umbralAsistencia);
  const umbralCara = Number(doc?.umbralCaraDuplicada);
  return {
    enrolamientoAbierto: Boolean(doc?.enrolamientoAbierto),
    umbralAsistencia:
      Number.isFinite(umbral) && umbral > 0 && umbral <= 100
        ? umbral
        : DEFAULT_UMBRAL,
    umbralCaraDuplicada:
      Number.isFinite(umbralCara) && umbralCara > 0 && umbralCara <= 1
        ? umbralCara
        : DEFAULT_UMBRAL_CARA,
  };
}

export async function saveSettings(
  db: Db,
  patch: Partial<AppSettings>
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.enrolamientoAbierto !== undefined)
    set.enrolamientoAbierto = patch.enrolamientoAbierto;
  if (patch.umbralAsistencia !== undefined) {
    const u = Number(patch.umbralAsistencia);
    if (Number.isFinite(u) && u > 0 && u <= 100) set.umbralAsistencia = u;
  }
  if (patch.umbralCaraDuplicada !== undefined) {
    const u = Number(patch.umbralCaraDuplicada);
    if (Number.isFinite(u) && u > 0 && u <= 1) set.umbralCaraDuplicada = u;
  }

  await db.collection("settings").updateOne(
    { key: SETTINGS_KEY },
    { $set: set, $setOnInsert: { key: SETTINGS_KEY } },
    { upsert: true }
  );
}
