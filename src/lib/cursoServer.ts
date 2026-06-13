import { ObjectId, type Db } from "mongodb";

// Devuelve el documento de curso que corresponde a un nombre.
// Si hay varias instancias del mismo nombre en años distintos, toma la más reciente activa.
export async function resolveCursoDoc(db: Db, cursoNombre: string) {
  const nombre = cursoNombre.trim();
  if (!nombre) return null;
  return db
    .collection("cursos")
    .find({ nombre, activo: { $ne: false } })
    .sort({ anio: -1 })
    .limit(1)
    .next();
}

// Resuelve el año (periodo) de un curso a partir de su nombre.
export async function resolveCursoYear(
  db: Db,
  cursoNombre: string
): Promise<number> {
  const doc = await resolveCursoDoc(db, cursoNombre);
  if (doc?.anio) return Number(doc.anio);
  return new Date().getFullYear();
}

// Vincula al estudiante con su curso: lo quita de cualquier otro curso
// y lo agrega al curso actual (lista "estudiantes" en la colección cursos).
export async function linkStudentToCurso(
  db: Db,
  studentId: ObjectId,
  cursoNombre: string
): Promise<void> {
  await unlinkStudentFromCursos(db, studentId);
  const doc = await resolveCursoDoc(db, cursoNombre);
  if (doc?._id) {
    await db.collection("cursos").updateOne(
      { _id: doc._id },
      // Tipado laxo: la colección no está tipada y $addToSet sobre un array es válido.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { $addToSet: { estudiantes: studentId } } as any
    );
  }
}

// Quita al estudiante de todos los cursos (al eliminarlo).
export async function unlinkStudentFromCursos(
  db: Db,
  studentId: ObjectId
): Promise<void> {
  await db.collection("cursos").updateMany(
    { estudiantes: studentId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { $pull: { estudiantes: studentId } } as any
  );
}
