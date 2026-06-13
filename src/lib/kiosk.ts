"use client";

import type { FaceDescriptorEntry } from "./types";
import {
  saveDescriptors,
  getDescriptors,
  queueAttendance,
  getQueue,
  clearQueueItems,
} from "./offline-db";

export function getKioskToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("kioskToken") || "";
}

export function setKioskToken(token: string) {
  localStorage.setItem("kioskToken", token);
}

export interface StudentSearchResult {
  rut: string;
  nombre: string;
  apellidos?: string;
  curso: string;
  perteneceAlmuerzo: boolean;
  enrolled: boolean;
}

// Busca estudiantes por nombre/apellido/RUT (para el ingreso manual del docente).
export async function searchStudents(
  q: string
): Promise<StudentSearchResult[]> {
  const token = getKioskToken();
  try {
    const res = await fetch(
      `/api/students/search?q=${encodeURIComponent(q)}`,
      { headers: { "x-kiosk-token": token }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// Descarga descriptores desde el servidor y los cachea. Si no hay red, usa el cache.
export async function loadDescriptors(): Promise<{
  entries: FaceDescriptorEntry[];
  source: "network" | "cache";
  authError?: boolean;
}> {
  const token = getKioskToken();
  try {
    const res = await fetch(`/api/descriptors`, {
      headers: { "x-kiosk-token": token },
      cache: "no-store",
    });
    if (res.status === 401) {
      const cached = await getDescriptors();
      return { entries: cached, source: "cache", authError: true };
    }
    const data = await res.json();
    const entries: FaceDescriptorEntry[] = data.entries || [];
    await saveDescriptors(entries);
    return { entries, source: "network" };
  } catch {
    const cached = await getDescriptors();
    return { entries: cached, source: "cache" };
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Marca asistencia: intenta online; si falla, la guarda en la cola offline.
export async function markAttendance(rec: {
  rut: string;
  nombre: string;
  curso: string;
  method: "facial" | "manual";
}): Promise<{ ok: boolean; offline: boolean; duplicate?: boolean }> {
  const token = getKioskToken();
  const body = { ...rec, timestamp: new Date().toISOString() };
  try {
    const res = await fetch(`/api/attendance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kiosk-token": token,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("server");
    const data = await res.json().catch(() => ({}));
    return { ok: true, offline: false, duplicate: Boolean(data.duplicate) };
  } catch {
    await queueAttendance({ ...rec, timestamp: body.timestamp, fecha: todayStr() });
    return { ok: true, offline: true };
  }
}

// Sincroniza la cola offline con el servidor.
export async function syncQueue(): Promise<number> {
  const queue = await getQueue();
  if (queue.length === 0) return 0;
  const token = getKioskToken();
  try {
    const res = await fetch(`/api/attendance/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-kiosk-token": token,
      },
      body: JSON.stringify({ records: queue }),
    });
    if (!res.ok) return 0;
    const ids = queue.map((q) => q.id!).filter((x) => x !== undefined);
    await clearQueueItems(ids);
    return queue.length;
  } catch {
    return 0;
  }
}

export async function pendingCount(): Promise<number> {
  return (await getQueue()).length;
}

// Lista de RUTs que ya ingresaron hoy (servidor + cola offline).
// Permite recordar los ingresos del día aunque se recargue la tablet.
export async function loadTodayRuts(): Promise<string[]> {
  const token = getKioskToken();
  const ruts = new Set<string>();
  try {
    const res = await fetch(`/api/attendance`, {
      headers: { "x-kiosk-token": token },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      for (const r of data.records || []) ruts.add(r.rut);
    }
  } catch {
    // Sin conexión: usamos solo la cola local.
  }
  try {
    const queue = await getQueue();
    const today = todayStr();
    for (const q of queue) if (q.fecha === today) ruts.add(q.rut);
  } catch {
    // Ignoramos errores de lectura local.
  }
  return Array.from(ruts);
}
