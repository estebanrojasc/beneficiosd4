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

export async function getDb(): Promise<Db> {
  const c = await getClientPromise();
  return c.db(dbName);
}
