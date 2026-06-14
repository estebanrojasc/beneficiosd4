// Utilidades de fecha en la zona horaria local del establecimiento (Chile).
// Importante: en servidores (Vercel) el reloj corre en UTC, por lo que usar
// toISOString().slice(0,10) puede devolver el día equivocado. Aquí calculamos
// la fecha "calendario" real en America/Santiago.

const TZ = "America/Santiago";

// Devuelve "YYYY-MM-DD" según la zona horaria del establecimiento.
export function dateInTZ(d: Date = new Date()): string {
  // en-CA produce el formato YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Mes actual en formato "YYYY-MM".
export function monthInTZ(d: Date = new Date()): string {
  return dateInTZ(d).slice(0, 7);
}
