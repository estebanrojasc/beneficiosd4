"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { FaceDescriptorEntry } from "./types";

const DB_NAME = "almuerzo-kiosko";
const DB_VERSION = 1;

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

// --- Descriptores cacheados ---
export async function saveDescriptors(entries: FaceDescriptorEntry[]) {
  const db = await getDB();
  const tx = db.transaction("descriptors", "readwrite");
  await tx.store.clear();
  for (const e of entries) await tx.store.put(e);
  await tx.done;
  await setMeta("descriptorsUpdatedAt", new Date().toISOString());
  await setMeta("descriptorsCount", entries.length);
}

export async function getDescriptors(): Promise<FaceDescriptorEntry[]> {
  const db = await getDB();
  return (await db.getAll("descriptors")) as FaceDescriptorEntry[];
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
