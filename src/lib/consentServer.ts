import {
  CONSENT_VERSION,
  calculateAge,
  getAutonomyTier,
  isAutonomousParentesco,
  type StudentConsent,
} from "./consent";
import { isValidRut, normalizeRut } from "./rut";

export interface ConsentInput {
  apoderadoNombre?: string;
  apoderadoRut?: string;
  parentesco?: string;
  firmadoAt?: string;
  notas?: string;
  autonomo?: boolean;
  fechaNacimiento?: string;
}

export interface BuildConsentResult {
  ok: boolean;
  error?: string;
  consent?: StudentConsent;
}

// Valida los datos de una autorización firmada y construye el subdocumento de
// consentimiento "otorgado". `registradoPor` es el usuario que la ingresa.
export function buildGrantedConsent(
  input: ConsentInput,
  registradoPor: string
): BuildConsentResult {
  const apoderadoNombre = (input.apoderadoNombre || "").trim();
  const parentesco = (input.parentesco || "").trim();
  const rawRut = (input.apoderadoRut || "").trim();
  const firmadoAt = (input.firmadoAt || "").trim();
  const notas = (input.notas || "").trim();
  const autonomo =
    Boolean(input.autonomo) || isAutonomousParentesco(parentesco);

  if (autonomo) {
    const fn = (input.fechaNacimiento || "").trim();
    if (fn) {
      const age = calculateAge(fn);
      if (getAutonomyTier(age) !== "plena") {
        return {
          ok: false,
          error:
            "El consentimiento autónomo solo aplica a estudiantes de 16 años o más.",
        };
      }
    }
  }

  const titularLabel = autonomo ? "estudiante" : "apoderado";
  if (apoderadoNombre.length < 3)
    return { ok: false, error: `Falta el nombre del ${titularLabel}.` };
  if (!parentesco)
    return {
      ok: false,
      error: autonomo
        ? "Indica que el estudiante consiente de forma autónoma."
        : "Indica el parentesco del apoderado.",
    };
  if (!rawRut || !isValidRut(rawRut))
    return {
      ok: false,
      error: autonomo
        ? "El RUT del estudiante no es válido."
        : "El RUT del apoderado no es válido.",
    };
  if (!firmadoAt || !/^\d{4}-\d{2}-\d{2}$/.test(firmadoAt))
    return { ok: false, error: "Indica la fecha de firma del documento." };

  const now = new Date().toISOString();
  return {
    ok: true,
    consent: {
      status: "otorgado",
      apoderadoNombre,
      apoderadoRut: normalizeRut(rawRut),
      parentesco,
      firmadoAt,
      registradoAt: now,
      registradoPor,
      termsVersion: CONSENT_VERSION,
      notas: notas || undefined,
      requiereRegularizacion: false,
    },
  };
}

// ¿El consentimiento permite tratar la biometría (cara)?
export function isConsentGranted(consent?: StudentConsent | null): boolean {
  return Boolean(consent && consent.status === "otorgado");
}

// SOLO PARA PRUEBAS: si NEXT_PUBLIC_BYPASS_CONSENT=true, se omite la exigencia
// de la autorización del apoderado para registrar la cara. NUNCA debe activarse
// en producción (trataría biometría de menores sin consentimiento válido).
export function isConsentBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BYPASS_CONSENT === "true";
}
