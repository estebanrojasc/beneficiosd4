import type { Db } from "mongodb";

// Mantiene sincronizada la "Lista almuerzo" (colección allowedRuts) con la
// marca "perteneceAlmuerzo" del perfil del estudiante.
// - Si el estudiante pertenece al almuerzo, se agrega/actualiza en la lista.
// - Si no pertenece, se quita de la lista.
export async function syncAllowedRut(
  db: Db,
  data: {
    rut: string;
    perteneceAlmuerzo: boolean;
    nombre?: string;
    apellidos?: string;
    curso?: string;
  }
): Promise<void> {
  const rut = (data.rut || "").trim();
  if (!rut) return;

  if (!data.perteneceAlmuerzo) {
    await db.collection("allowedRuts").deleteOne({ rut });
    return;
  }

  const set: Record<string, string> = {};
  if (data.nombre) set.nombre = data.nombre.trim();
  if (data.apellidos) set.apellidos = data.apellidos.trim();
  if (data.curso) set.curso = data.curso.trim();

  const update: Record<string, unknown> = {
    $setOnInsert: { rut, createdAt: new Date().toISOString() },
  };
  if (Object.keys(set).length > 0) update.$set = set;

  await db
    .collection("allowedRuts")
    .updateOne({ rut }, update, { upsert: true });
}
