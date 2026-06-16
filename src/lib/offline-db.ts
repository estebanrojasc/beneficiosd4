"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { FaceDescriptorEntry } from "./types";
import {
  encryptJSON,
  decryptJSON,
  generateSalt,
  type EncryptedBlob,
} from "./kioskCrypto";

const DB_NAME = "almuerzo-kiosko";
const DB_VERSION = 1;

// Vigencia de la caché de descriptores en la tablet. Pasado este tiempo sin
// poder refrescar desde el servidor, se considera caducada y se descarta, para
// no operar con datos biométricos potencialmente obsoletos. (24 horas)
const DESCRIPTOR_TTL_MS = 24 * 60 * 60 * 1000;

interface QueuedAttendance {
  id?: number;
  rut: string;
  nombre: string;
  curso: string;
  method: "facial" | "manual";
  timestamp: string;
  fecha: string;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB solo disponible en el navegador");
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("descriptors")) {
          db.createObjectStore("descriptors", { keyPath: "rut" });
        }
        if (!db.objectStoreNames.contains("queue")) {
          db.createObjectStore("queue", {
            keyPath: "id",
            autoIncrement: true,
          });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// --- Descriptores cacheados (cifrados en reposo) ---
// La caché se cifra con una clave derivada del secreto del kiosko (clave del
// validador del programa). Si no hay secreto o Web Crypto no está disponible, NO
// se cachea en disco: el kiosko funcionará solo con conexión.
export async function saveDescriptors(
  entries: FaceDescriptorEntry[],
  secret: string
) {
  const db = await getDB();
  // Migración/limpieza: descartamos cualquier copia en claro previa.
  const tx = db.transaction("descriptors", "readwrite");
  await tx.store.clear();
  await tx.done;

  let salt = (await getMeta("descriptorsSalt")) as string | undefined;
  if (!salt) {
    salt = generateSalt();
    await setMeta("descriptorsSalt", salt);
  }

  const blob = await encryptJSON(entries, secret, salt);
  if (!blob) {
    // Sin cifrado posible: no dejamos descriptores en disco.
    await setMeta("descriptorsBlob", null);
    await setMeta("descriptorsCount", 0);
    return;
  }

  const now = Date.now();
  await setMeta("descriptorsBlob", blob);
  await setMeta("descriptorsUpdatedAt", new Date(now).toISOString());
  await setMeta("descriptorsExpiresAt", now + DESCRIPTOR_TTL_MS);
  await setMeta("descriptorsCount", entries.length);
}

export async function getDescriptors(
  secret: string
): Promise<FaceDescriptorEntry[]> {
  const blob = (await getMeta("descriptorsBlob")) as
    | EncryptedBlob
    | null
    | undefined;
  if (!blob) return [];

  const expiresAt = (await getMeta("descriptorsExpiresAt")) as
    | number
    | undefined;
  if (typeof expiresAt === "number" && Date.now() > expiresAt) {
    // Caché caducada: la descartamos.
    await clearDescriptors();
    return [];
  }

  const salt = (await getMeta("descriptorsSalt")) as string | undefined;
  if (!salt) return [];

  const entries = await decryptJSON<FaceDescriptorEntry[]>(blob, secret, salt);
  // Clave incorrecta o blob corrupto: no devolvemos nada (y no rompemos).
  return Array.isArray(entries) ? entries : [];
}

// Borra la caché de descriptores (al cerrar sesión del kiosko o cambiar de clave).
export async function clearDescriptors() {
  const db = await getDB();
  const tx = db.transaction("descriptors", "readwrite");
  await tx.store.clear();
  await tx.done;
  await setMeta("descriptorsBlob", null);
  await setMeta("descriptorsExpiresAt", 0);
  await setMeta("descriptorsCount", 0);
}

// --- Cola de asistencia offline ---
export async function queueAttendance(record: Omit<QueuedAttendance, "id">) {
  const db = await getDB();
  await db.add("queue", record);
}

export async function getQueue(): Promise<QueuedAttendance[]> {
  const db = await getDB();
  return (await db.getAll("queue")) as QueuedAttendance[];
}

export async function clearQueueItems(ids: number[]) {
  const db = await getDB();
  const tx = db.transaction("queue", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

export async function isQueuedToday(rut: string, fecha: string) {
  const queue = await getQueue();
  return queue.some((q) => q.rut === rut && q.fecha === fecha);
}

// --- Meta ---
export async function setMeta(key: string, value: unknown) {
  const db = await getDB();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string) {
  const db = await getDB();
  const r = await db.get("meta", key);
  return r?.value;
}
