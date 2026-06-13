import type { Db } from "mongodb";

// Configuración global del establecimiento (documento único).
const SETTINGS_KEY = "config";

export interface AppSettings {
  enrolamientoAbierto: boolean;
}

export async function getSettings(db: Db): Promise<AppSettings> {
  const doc = await db.collection("settings").findOne({ key: SETTINGS_KEY });
  return {
    enrolamientoAbierto: Boolean(doc?.enrolamientoAbierto),
  };
}

export async function saveSettings(
  db: Db,
  patch: Partial<AppSettings>
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.enrolamientoAbierto !== undefined)
    set.enrolamientoAbierto = patch.enrolamientoAbierto;

  await db.collection("settings").updateOne(
    { key: SETTINGS_KEY },
    { $set: set, $setOnInsert: { key: SETTINGS_KEY } },
    { upsert: true }
  );
}
