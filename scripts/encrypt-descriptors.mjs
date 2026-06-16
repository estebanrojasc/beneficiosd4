// Migración: cifra en reposo los descriptores faciales ya cargados.
//
// Convierte los `faceDescriptor` guardados como arreglo (texto plano) al formato
// cifrado AES-256-GCM "enc:v1:<base64>" que usa la app (src/lib/crypto.ts).
// Es idempotente: los que ya están cifrados (string) se omiten.
//
// Uso (desde la raíz del proyecto):
//   node scripts/encrypt-descriptors.mjs            (aplica los cambios)
//   node scripts/encrypt-descriptors.mjs --dry-run  (solo muestra qué haría)
//
// IMPORTANTE: usa la MISMA llave que la app (DATA_ENCRYPTION_KEY, o AUTH_SECRET
// como respaldo). Si la llave no coincide, los descriptores no se podrán leer.

import { MongoClient } from "mongodb";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Debe coincidir EXACTAMENTE con src/lib/crypto.ts.
const PREFIX = "enc:v1:";
const IV_LEN = 12;
const SALT = "almuerzo-descriptor-v1";

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      const value = t.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // Sin .env.local: usamos solo el entorno.
  }
}

function deriveKey() {
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) return null;
  return crypto.scryptSync(secret, SALT, 32);
}

function encryptDescriptor(descriptor, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(descriptor), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
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
  const key = deriveKey();
  if (!key) {
    console.error(
      "Falta DATA_ENCRYPTION_KEY (o AUTH_SECRET). Configúrala en .env.local."
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const students = client.db(dbName).collection("students");

    // Solo los que tienen el descriptor como arreglo (texto plano).
    const cursor = students.find(
      { faceDescriptor: { $type: "array" } },
      { projection: { faceDescriptor: 1 } }
    );

    let toEncrypt = 0;
    let done = 0;
    for await (const doc of cursor) {
      toEncrypt++;
      if (dryRun) continue;
      const encrypted = encryptDescriptor(doc.faceDescriptor, key);
      await students.updateOne(
        { _id: doc._id },
        { $set: { faceDescriptor: encrypted } }
      );
      done++;
    }

    console.log("--- Cifrado de descriptores ---");
    console.log(`Base de datos:           ${dbName}`);
    console.log(`Descriptores en texto:   ${toEncrypt}`);
    if (dryRun) {
      console.log("[dry-run] No se aplicaron cambios.");
    } else {
      console.log(`Cifrados ahora:          ${done}`);
      console.log("Listo.");
    }
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Error en el cifrado:", err);
  process.exit(1);
});
