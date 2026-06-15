import { MongoClient, Db } from "mongodb";
import dns from "node:dns";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "almuerzo_escolar";

if (!uri) {
  // No lanzamos en import-time para no romper el build; se valida al conectar.
  console.warn(
    "[mongodb] Falta la variable MONGODB_URI. Configúrala en .env.local"
  );
}

// En Windows, Node a veces toma un resolutor DNS que rechaza las consultas SRV
// que necesita mongodb+srv (querySrv ECONNREFUSED), aunque el DNS del sistema
// funcione. Forzamos un DNS público confiable para esas consultas.
function ensureReliableDns() {
  if (!uri?.startsWith("mongodb+srv://")) return;
  const custom = process.env.MONGODB_DNS_SERVERS;
  const servers = custom
    ? custom.split(",").map((s) => s.trim()).filter(Boolean)
    : ["1.1.1.1", "8.8.8.8"];
  try {
    const current = dns.getServers();
    const alreadySet = servers.every((s) => current.includes(s));
    if (!alreadySet) dns.setServers([...servers, ...current]);
  } catch {
    // Si falla, seguimos con el DNS por defecto.
  }
}

let client: MongoClient | undefined;
let clientPromise: Promise<MongoClient> | undefined;

// Cache global para evitar múltiples conexiones en desarrollo (hot reload).
const globalForMongo = globalThis as unknown as {
  _mongoClientPromise?: Promise<MongoClient>;
};

function getClientPromise(): Promise<MongoClient> {
  if (!uri) {
    throw new Error(
      "MONGODB_URI no está configurada. Revisa tu archivo .env.local"
    );
  }

  ensureReliableDns();

  if (process.env.NODE_ENV === "development") {
    if (!globalForMongo._mongoClientPromise) {
      client = new MongoClient(uri);
      globalForMongo._mongoClientPromise = client.connect();
    }
    return globalForMongo._mongoClientPromise;
  }

  if (!clientPromise) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

let indexesPromise: Promise<void> | null = null;

// Garantiza a nivel de base de datos las reglas de unicidad:
// - Un RUT único por estudiante y por entrada de la Lista almuerzo.
// - Un curso único por nombre + año.
// Se ejecuta una sola vez por proceso. Si ya existen duplicados, la creación
// del índice puede fallar; lo registramos sin romper la app (la validación a
// nivel de aplicación sigue protegiendo).
async function ensureIndexes(db: Db): Promise<void> {
  if (!indexesPromise) {
    indexesPromise = (async () => {
      try {
        await db
          .collection("students")
          .createIndex({ rut: 1 }, { unique: true });
        await db.collection("students").createIndex({ nombre: 1 });
        await db.collection("students").createIndex({ curso: 1, nombre: 1 });
        await db
          .collection("allowedRuts")
          .createIndex({ rut: 1 }, { unique: true });
        await db
          .collection("cursos")
          .createIndex({ nombre: 1, anio: 1 }, { unique: true });
        await db
          .collection("users")
          .createIndex({ username: 1 }, { unique: true });
        // Programas: un RUT no se repite dentro del mismo programa.
        await db
          .collection("program_members")
          .createIndex({ programId: 1, rut: 1 }, { unique: true });
        // Registros: índice de apoyo para consultas por programa/fecha/rut.
        await db
          .collection("program_records")
          .createIndex({ programId: 1, fecha: 1, rut: 1 });
        await db
          .collection("programs")
          .createIndex({ slug: 1 }, { sparse: true });
        await db.collection("programs").createIndex({ estado: 1, nombre: 1 });
      } catch (err) {
        console.warn(
          "[mongodb] No se pudieron crear todos los índices únicos. " +
            "Revisa si hay datos duplicados.",
          err
        );
      }
    })();
  }
  return indexesPromise;
}

export async function getDb(): Promise<Db> {
  const c = await getClientPromise();
  const db = c.db(dbName);
  await ensureIndexes(db);
  return db;
}
