// Retención automática de biometría (Ley 21.719: limitación del plazo de
// conservación). Borra el descriptor facial cuando ya no corresponde
// conservarlo. Pensado para ejecutarse de forma programada (cron / Programador
// de tareas), por ejemplo una vez al día o al cerrar el año escolar.
//
// Criterios (se leen de Ajustes -> settings):
//   - retencionPurgaAnioAnterior: borra biometría de cursos de años anteriores.
//   - retencionMeses: borra biometría sin actualizar por N meses (0 = off).
//
// Uso (desde la raíz del proyecto):
//   node scripts/apply-retention.mjs            (aplica los cambios)
//   node scripts/apply-retention.mjs --dry-run  (solo muestra qué haría)
//
// Lee MONGODB_URI y MONGODB_DB desde el entorno o desde .env.local.

import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Si no hay .env.local, usamos solo las variables del entorno.
  }
}

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "almuerzo_escolar";

  if (!uri) {
    console.error("Falta MONGODB_URI (en el entorno o en .env.local).");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const students = db.collection("students");
    const settings = await db.collection("settings").findOne({ key: "config" });

    const meses = Number(settings?.retencionMeses) || 0;
    const anioAnterior = Boolean(settings?.retencionPurgaAnioAnterior);

    const or = [];
    if (anioAnterior) {
      const anioActual = new Date().getFullYear();
      or.push({ anio: { $lt: anioActual } });
    }
    if (meses > 0) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - meses);
      or.push({ updatedAt: { $lt: cutoff.toISOString() } });
    }

    console.log("--- Retención de biometría ---");
    console.log(`Base de datos:            ${dbName}`);
    console.log(`Purgar año anterior:      ${anioAnterior ? "sí" : "no"}`);
    console.log(`Inactividad (meses):      ${meses || "—"}`);

    if (or.length === 0) {
      console.log("\nNo hay criterios de retención activos. Nada que hacer.");
      return;
    }

    const filter = { faceDescriptor: { $ne: null }, $or: or };
    const docs = await students
      .find(filter)
      .project({ rut: 1 })
      .toArray();

    console.log(`Estudiantes con biometría a purgar: ${docs.length}`);

    if (dryRun) {
      console.log("\n[dry-run] No se aplicaron cambios.");
      return;
    }
    if (docs.length === 0) return;

    const now = new Date().toISOString();
    const ids = docs.map((d) => d._id);
    const res = await students.updateMany(
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

    // Trazabilidad en la auditoría.
    if (docs.length > 0) {
      await db.collection("audit_logs").insertMany(
        docs.map((d) => ({
          action: "retention.purge",
          actor: "script:apply-retention",
          actorType: "system",
          rut: d.rut,
          studentId: d._id.toString(),
          detail: "Biometría eliminada por política de retención",
          meta: { anioAnterior, meses },
          at: now,
        }))
      );
    }

    console.log(`\nBiometría eliminada en ${res.modifiedCount} estudiantes.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Error en la retención:", err);
  process.exit(1);
});
