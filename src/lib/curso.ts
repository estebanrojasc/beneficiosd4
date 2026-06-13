// Tipos y utilidades para la configuración de cursos de la escuela.
// Ejemplo: nivel=3, ciclo="Básico", letra="A" → "3° Básico A"

export interface Curso {
  _id?: string;
  nivel: number;
  ciclo: string;
  letra: string;
  nombre: string; // "3° Básico A" (generado automáticamente)
  anio: number; // periodo al que pertenece el curso (2026, 2027, ...)
  activo: boolean;
  createdAt: string;
}

// Configuración de ciclos del establecimiento.
// Prekínder y Kínder no usan número de nivel; Básico es 1°-8° y Medio 1°-4°.
export interface CicloConfig {
  ciclo: string;
  usaNivel: boolean;
  min?: number;
  max?: number;
}

export const CICLOS: CicloConfig[] = [
  { ciclo: "Prekínder", usaNivel: false },
  { ciclo: "Kínder", usaNivel: false },
  { ciclo: "Básico", usaNivel: true, min: 1, max: 8 },
  { ciclo: "Medio", usaNivel: true, min: 1, max: 4 },
];

export const CICLO_OPTIONS = CICLOS.map((c) => c.ciclo);

export function getCicloConfig(ciclo: string): CicloConfig | undefined {
  return CICLOS.find((c) => c.ciclo === ciclo.trim());
}

// Orden de los ciclos para ordenar visualmente (Prekínder primero).
export function cicloOrder(ciclo: string): number {
  const idx = CICLOS.findIndex((c) => c.ciclo === ciclo.trim());
  return idx === -1 ? 99 : idx;
}

export function buildCursoName(nivel: number, ciclo: string, letra: string): string {
  const conf = getCicloConfig(ciclo);
  const letraSan = letra.trim().toUpperCase();
  // Prekínder/Kínder no llevan número al inicio.
  if (conf && !conf.usaNivel) return `${ciclo.trim()} ${letraSan}`.trim();
  return `${nivel}° ${ciclo.trim()} ${letraSan}`.trim();
}

// Separa "Nombre Apellido1 Apellido2" en { nombre, apellidos }
export function splitNombreCompleto(nombreCompleto: string): {
  nombre: string;
  apellidos: string;
} {
  const parts = nombreCompleto.trim().split(/\s+/);
  if (parts.length <= 1) return { nombre: parts[0] || "", apellidos: "" };
  return { nombre: parts[0], apellidos: parts.slice(1).join(" ") };
}

// Concatena nombre + apellidos para mostrar en pantallas públicas.
export function fullName(nombre: string, apellidos?: string): string {
  return [nombre.trim(), (apellidos || "").trim()].filter(Boolean).join(" ");
}
