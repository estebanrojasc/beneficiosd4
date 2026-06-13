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
