import type { Db } from "mongodb";
import { isValidConsentSections, type ConsentSection } from "./consent";

// Configuración global del establecimiento (documento único).
const SETTINGS_KEY = "config";

export interface AppSettings {
  enrolamientoAbierto: boolean;
  // Umbral (%) bajo el cual se considera "baja asistencia al almuerzo".
  umbralAsistencia: number;
  // Similitud coseno (0–1) sobre la cual se considera que dos caras son la
  // MISMA persona. Más alto = más estricto (deja pasar gemelos/hermanos).
  umbralCaraDuplicada: number;
  // Identidad institucional para reportes y branding.
  establecimientoNombre: string;
  // Logo como data URL (base64) o vacío.
  logo: string;
  // --- Protección de datos (Ley 21.719) ---
  // Responsable del tratamiento (si difiere del nombre del establecimiento).
  responsableTratamiento: string;
  // Encargado de Protección de Datos (DPO): nombre y contacto público.
  dpoNombre: string;
  dpoContacto: string; // correo, teléfono o dirección
  // Retención de biometría: meses de inactividad tras los cuales se borra el
  // descriptor facial (0 = sin límite por inactividad).
  retencionMeses: number;
  // Borrar biometría de cursos de años anteriores al actual (fin de año escolar).
  retencionPurgaAnioAnterior: boolean;
  // Override del texto de autorización/privacidad. Vacío = se genera automático
  // con los datos del establecimiento, DPO y proveedor.
  consentTextos: ConsentSection[];
}

const DEFAULT_UMBRAL = 70;
const DEFAULT_UMBRAL_CARA = 0.75;
// Límite del logo para no inflar la base ni los reportes (~250 KB en base64).
const MAX_LOGO_LEN = 350_000;

export async function getSettings(db: Db): Promise<AppSettings> {
  const doc = await db.collection("settings").findOne({ key: SETTINGS_KEY });
  const umbral = Number(doc?.umbralAsistencia);
  const umbralCara = Number(doc?.umbralCaraDuplicada);
  return {
    enrolamientoAbierto: Boolean(doc?.enrolamientoAbierto),
    umbralAsistencia:
      Number.isFinite(umbral) && umbral > 0 && umbral <= 100
        ? umbral
        : DEFAULT_UMBRAL,
    umbralCaraDuplicada:
      Number.isFinite(umbralCara) && umbralCara > 0 && umbralCara <= 1
        ? umbralCara
        : DEFAULT_UMBRAL_CARA,
    establecimientoNombre:
      typeof doc?.establecimientoNombre === "string"
        ? doc.establecimientoNombre
        : "",
    logo: typeof doc?.logo === "string" ? doc.logo : "",
    responsableTratamiento:
      typeof doc?.responsableTratamiento === "string"
        ? doc.responsableTratamiento
        : "",
    dpoNombre: typeof doc?.dpoNombre === "string" ? doc.dpoNombre : "",
    dpoContacto: typeof doc?.dpoContacto === "string" ? doc.dpoContacto : "",
    retencionMeses:
      Number.isFinite(Number(doc?.retencionMeses)) &&
      Number(doc?.retencionMeses) >= 0
        ? Math.floor(Number(doc?.retencionMeses))
        : 0,
    retencionPurgaAnioAnterior: Boolean(doc?.retencionPurgaAnioAnterior),
    consentTextos: isValidConsentSections(doc?.consentTextos)
      ? (doc!.consentTextos as ConsentSection[])
      : [],
  };
}

export async function saveSettings(
  db: Db,
  patch: Partial<AppSettings>
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.enrolamientoAbierto !== undefined)
    set.enrolamientoAbierto = patch.enrolamientoAbierto;
  if (patch.umbralAsistencia !== undefined) {
    const u = Number(patch.umbralAsistencia);
    if (Number.isFinite(u) && u > 0 && u <= 100) set.umbralAsistencia = u;
  }
  if (patch.umbralCaraDuplicada !== undefined) {
    const u = Number(patch.umbralCaraDuplicada);
    if (Number.isFinite(u) && u > 0 && u <= 1) set.umbralCaraDuplicada = u;
  }
  if (patch.establecimientoNombre !== undefined) {
    set.establecimientoNombre = String(patch.establecimientoNombre).slice(0, 120);
  }
  if (patch.logo !== undefined) {
    const logo = String(patch.logo);
    // Solo aceptamos data URLs de imagen dentro del límite, o vacío para quitarlo.
    if (logo === "") set.logo = "";
    else if (/^data:image\//.test(logo) && logo.length <= MAX_LOGO_LEN)
      set.logo = logo;
  }
  if (patch.responsableTratamiento !== undefined)
    set.responsableTratamiento = String(patch.responsableTratamiento).slice(0, 160);
  if (patch.dpoNombre !== undefined)
    set.dpoNombre = String(patch.dpoNombre).slice(0, 160);
  if (patch.dpoContacto !== undefined)
    set.dpoContacto = String(patch.dpoContacto).slice(0, 240);
  if (patch.retencionMeses !== undefined) {
    const m = Number(patch.retencionMeses);
    if (Number.isFinite(m) && m >= 0 && m <= 240) set.retencionMeses = Math.floor(m);
  }
  if (patch.retencionPurgaAnioAnterior !== undefined)
    set.retencionPurgaAnioAnterior = Boolean(patch.retencionPurgaAnioAnterior);
  if (patch.consentTextos !== undefined) {
    // Array vacío (o inválido) limpia el override → se vuelve al texto automático.
    const v = patch.consentTextos;
    set.consentTextos = isValidConsentSections(v)
      ? v.map((s) => ({
          titulo: String(s.titulo).slice(0, 200),
          parrafos: s.parrafos.map((p) => String(p).slice(0, 4000)),
        }))
      : [];
  }

  await db.collection("settings").updateOne(
    { key: SETTINGS_KEY },
    { $set: set, $setOnInsert: { key: SETTINGS_KEY } },
    { upsert: true }
  );
}
