import type { Db } from "mongodb";
import { decryptDescriptor } from "./crypto";

// Similitud coseno entre dos vectores (descriptores ArcFace ya normalizados).
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / ((Math.sqrt(normA) || 1) * (Math.sqrt(normB) || 1));
}

export interface DuplicateFaceMatch {
  rut: string;
  nombre: string;
  apellidos: string;
  curso: string;
  score: number;
}

// Busca un estudiante YA enrolado cuya cara sea (casi) idéntica a la del
// descriptor entregado, excluyendo el propio RUT. Devuelve la mejor coincidencia
// por encima del umbral o null. Un umbral alto deja pasar gemelos/hermanos.
export async function findDuplicateFace(
  db: Db,
  descriptor: number[],
  excludeRut: string,
  threshold: number
): Promise<DuplicateFaceMatch | null> {
  if (!Array.isArray(descriptor) || descriptor.length === 0) return null;

  const docs = await db
    .collection("students")
    .find({
      enrolled: true,
      faceDescriptor: { $ne: null },
      rut: { $ne: excludeRut },
    })
    .project({ rut: 1, nombre: 1, apellidos: 1, curso: 1, faceDescriptor: 1 })
    .toArray();

  let best: DuplicateFaceMatch | null = null;
  for (const d of docs) {
    const desc = decryptDescriptor(d.faceDescriptor);
    if (!Array.isArray(desc) || desc.length !== descriptor.length) continue;
    const score = cosineSimilarity(descriptor, desc);
    if (score >= threshold && (!best || score > best.score)) {
      best = {
        rut: d.rut,
        nombre: d.nombre || "",
        apellidos: d.apellidos || "",
        curso: d.curso || "",
        score,
      };
    }
  }
  return best;
}
