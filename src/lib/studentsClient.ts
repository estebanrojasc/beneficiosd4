export interface StudentsPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// Normaliza la respuesta paginada de GET /api/students.
export async function fetchStudentsPage<T>(
  params: URLSearchParams
): Promise<StudentsPage<T>> {
  const res = await fetch(`/api/students?${params.toString()}`);
  if (!res.ok) return { items: [], total: 0, hasMore: false };
  const data = await res.json();
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length, hasMore: false };
  }
  const items = Array.isArray(data.items) ? (data.items as T[]) : [];
  return {
    items,
    total: Number(data.total) || items.length,
    hasMore: Boolean(data.hasMore),
  };
}
