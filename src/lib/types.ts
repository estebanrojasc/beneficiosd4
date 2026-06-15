// Tipos compartidos entre cliente y servidor.

export interface Student {
  _id?: string;
  nombre: string;
  apellidos: string;
  curso: string; // "3° Básico A"
  anio: number;
  rut: string; // normalizado: 12345678-9
  perteneceAlmuerzo: boolean;
  // Descriptor matemático ArcFace de la cara (512 floats). NO se guarda la foto.
  faceDescriptor: number[] | null;
  enrolled: boolean;
  createdAt: string;
  updatedAt: string;
}

// Listado maestro de RUTs autorizados para almorzar.
export interface AllowedRut {
  _id?: string;
  rut: string; // normalizado
  nombre?: string;
  curso?: string;
  createdAt: string;
}

export interface AttendanceRecord {
  rut: string;
  nombre: string;
  curso: string;
  timestamp: string;
  method: "facial" | "manual";
}

export interface AttendanceDay {
  _id?: string;
  fecha: string; // YYYY-MM-DD
  records: AttendanceRecord[];
  updatedAt: string;
}

// Descriptor liviano que se envía al kiosko para reconocer caras offline.
export interface FaceDescriptorEntry {
  rut: string;
  nombre: string;
  curso: string;
  perteneceAlmuerzo: boolean;
  descriptor: number[];
}

// --- Usuarios y roles ---------------------------------------------------------

// Rol del usuario que opera el sistema (no del estudiante).
// El rol es una clave dinámica (los roles se administran en Gestión → Roles).
// "administrador" es un rol base con control total que no se puede limitar.
export type UserRole = string;

export const USER_ROLES: UserRole[] = [
  "administrador",
  "coordinador",
  "docente",
];

// Capacidades (permisos) que un rol puede tener. Cada una habilita una sección.
export const CAP_KEYS = [
  "operacion",
  "programas",
  "enrolar",
  "estudiantes",
  "cursos",
  "usuarios",
  "ajustes",
] as const;

export type CapKey = (typeof CAP_KEYS)[number];

export const CAP_LABELS: Record<CapKey, string> = {
  operacion: "Operar (validar/registrar)",
  programas: "Gestionar programas",
  enrolar: "Enrolar (QR)",
  estudiantes: "Estudiantes",
  cursos: "Cursos",
  usuarios: "Usuarios y roles",
  ajustes: "Ajustes",
};

export type RoleCaps = Record<CapKey, boolean>;

export interface Role {
  _id?: string;
  key: string; // identificador (se guarda en users.role)
  label: string; // nombre visible
  caps: RoleCaps;
  // Los roles base no se pueden eliminar (administrador, coordinador, docente).
  builtin: boolean;
}

// --- Carga masiva con IA -----------------------------------------------------

export type ImportStatus =
  | "processing"
  | "review"
  | "committing"
  | "done"
  | "error"
  | "cancelled";

// Un estudiante extraído por la IA, con sus validaciones para revisión.
export interface ImportStudent {
  nombre: string;
  apellidos: string;
  rut: string;
  curso: string;
  rutValido: boolean;
  yaExiste: boolean; // ya está en la base de datos
  enrolado: boolean; // ya tiene cara registrada
  dupEnArchivo: boolean; // RUT repetido dentro del mismo archivo
  incluir: boolean; // seleccionado para cargar
}

export interface ImportJob {
  _id: string;
  status: ImportStatus;
  programId: string;
  // Origen del proceso: archivo (IA) o lista pegada (texto).
  source?: "archivo" | "texto";
  fileName: string;
  comentario: string;
  pageCount: number;
  students: ImportStudent[];
  summary?: { created: number; skipped: number; errors: number };
  error?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface AppUser {
  _id?: string;
  username: string; // normalizado a minúsculas
  nombre: string;
  role: UserRole;
  active: boolean;
  // Obliga a cambiar la clave en el primer ingreso (o tras un reinicio).
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string | null;
}

// --- Programas (listas dinámicas que reutilizan los enrolamientos) -----------

// Modalidad del programa:
//  - temporal: registro recurrente por día (ej. almuerzo). Reporte de grilla mensual.
//  - puntual: una sola entrega por persona (ej. tarjetas, materiales).
export type ProgramModalidad = "temporal" | "puntual";
export type ProgramEstado = "activo" | "cerrado";

export interface Program {
  _id?: string;
  nombre: string;
  descripcion?: string;
  modalidad: ProgramModalidad;
  estado: ProgramEstado;
  icono: string; // emoji para identificarlo visualmente
  color: string; // color de acento (hex)
  // Si true, solo pueden registrarse los RUT de la lista del programa.
  // Si false, cualquier estudiante enrolado puede registrarse.
  requiereMembresia: boolean;
  // Habilita el auto-registro por QR (el estudiante se marca desde su celular).
  permitirAutoRegistro: boolean;
  // Token público para el QR de auto-registro del estudiante.
  qrToken: string;
  // Minutos de validez del QR de registro (0 = sin límite).
  qrVentanaMin: number;
  // Momento en que se abrió la ventana de registro (null = cerrada).
  qrOpenAt?: string | null;
  // Clave del validador (kiosko) propia del programa (como KIOSK_TOKEN).
  validadorClave: string;
  // Umbral (%) de baja asistencia (solo modalidad temporal).
  umbralAsistencia: number;
  // Marca el programa migrado del almuerzo original (para no duplicarlo).
  slug?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

export interface ProgramMember {
  _id?: string;
  programId: string;
  rut: string;
  nombre?: string;
  apellidos?: string;
  curso?: string;
  createdAt: string;
}

export interface ProgramRecord {
  _id?: string;
  programId: string;
  rut: string;
  nombre: string;
  curso: string;
  fecha: string; // YYYY-MM-DD
  timestamp: string;
  method: "facial" | "manual" | "qr";
  by?: string; // usuario que registró (si aplica)
}
