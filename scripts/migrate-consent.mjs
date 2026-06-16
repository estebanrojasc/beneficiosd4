// Migración: agrega el subdocumento `consent` a los estudiantes existentes.
//
// Política de la migración (decisión de diseño, se puede ajustar):
//  - NO se borran datos biométricos ya cargados (para no interrumpir la
//    operación del kiosko/almuerzo).
//  - Todo estudiante queda con consent.status = "pendiente".
//  - Los que YA tienen cara registrada (enrolled o faceDescriptor) se marcan
//    con requiereRegularizacion = true: tienen biometría sin autorización
//    firmada registrada y hay que recolectarla.
//
// Uso (desde la raíz del proyecto):
//   node scripts/migrate-consent.mjs            (aplica los cambios)
//   node scripts/migrate-consent.mjs --dry-run  (solo muestra qué haría)
//
// Lee MONGODB_URI y MONGODB_DB desde el entorno o desde .env.local.

import { MongoClient } from "mongodb";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Carga simple de .env.local sin dependencias externas.
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

    const total = await students.countDocuments({});
    const sinConsent = await students.countDocuments({
      consent: { $exists: false },
    });
    const conCaraSinConsent = await students.countDocuments({
      consent: { $exists: false },
      $or: [{ enrolled: true }, { faceDescriptor: { $ne: null } }],
    });

    console.log("--- Migración de consentimiento ---");
    console.log(`Base de datos:           ${dbName}`);
    console.log(`Estudiantes totales:     ${total}`);
    console.log(`Sin campo 'consent':     ${sinConsent}`);
    console.log(`  · con cara (regular.): ${conCaraSinConsent}`);
    console.log(`  · sin cara:            ${sinConsent - conCaraSinConsent}`);

    if (dryRun) {
      console.log("\n[dry-run] No se aplicaron cambios.");
      return;
    }

    const now = new Date().toISOString();

    // 1) Los que tienen cara registrada → pendiente + requiereRegularizacion.
    const r1 = await students.updateMany(
      {
        consent: { $exists: false },
        $or: [{ enrolled: true }, { faceDescriptor: { $ne: null } }],
      },
      {
        $set: {
          consent: { status: "pendiente", requiereRegularizacion: true },
          updatedAt: now,
        },
      }
    );

    // 2) El resto (sin cara) → solo pendiente.
    const r2 = await students.updateMany(
      { consent: { $exists: false } },
      {
        $set: {
          consent: { status: "pendiente", requiereRegularizacion: false },
          updatedAt: now,
        },
      }
    );

    console.log("\nCambios aplicados:");
    console.log(`  Marcados para regularizar: ${r1.modifiedCount}`);
    console.log(`  Marcados como pendientes:  ${r2.modifiedCount}`);
    console.log("\nListo. Recuerda recolectar las autorizaciones firmadas de");
    console.log("los estudiantes marcados como 'Regularizar' en el panel.");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Error en la migración:", err);
  process.exit(1);
});
