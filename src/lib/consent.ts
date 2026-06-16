// Textos legales y modelo de consentimiento para el tratamiento de datos
// biométricos (Ley N° 21.719 de Protección de Datos Personales, Chile).
//
// IMPORTANTE: este módulo es compartido entre cliente y servidor. NO debe
// importar nada que sólo exista en el navegador ni en Node. Solo tipos y
// funciones puras.
//
// Versión del texto consentido. Si el texto cambia de forma material, sube la
// versión: las autorizaciones quedan ligadas a la versión que firmó el
// apoderado, de modo que se puede saber QUÉ aceptó exactamente cada persona.
export const CONSENT_VERSION = "1.1";

// Plazo (días corridos) máximo para eliminar la biometría de sistemas activos
// y respaldos tras el egreso, baja del beneficio o revocación.
export const RETENCION_DIAS_DEFAULT = 30;

// Estados del consentimiento de un estudiante.
//  - pendiente: aún no hay autorización registrada (la cara queda bloqueada).
//  - otorgado: el apoderado firmó y un funcionario la registró.
//  - revocado: el apoderado retiró el consentimiento (se borra el descriptor).
export type ConsentStatus = "pendiente" | "otorgado" | "revocado";

export interface StudentConsent {
  status: ConsentStatus;
  // Datos de quien autoriza (apoderado o representante legal del menor).
  apoderadoNombre?: string;
  apoderadoRut?: string; // normalizado
  parentesco?: string; // Madre, Padre, Tutor(a) legal, ...
  // Fecha en que se firmó el documento físico (YYYY-MM-DD).
  firmadoAt?: string;
  // Momento en que se ingresó la autorización al sistema (ISO).
  registradoAt?: string;
  // Usuario del sistema que registró la autorización firmada.
  registradoPor?: string;
  // Versión del texto que el apoderado consintió.
  termsVersion?: string;
  // Observaciones (p. ej. ubicación del documento físico archivado).
  notas?: string;
  // Revocación.
  revocadoAt?: string;
  revocadoPor?: string;
  // Marca para datos biométricos cargados ANTES de existir este flujo: tienen
  // cara registrada pero falta recolectar/registrar la autorización firmada.
  requiereRegularizacion?: boolean;
}

// Parentescos sugeridos para el formulario.
// Parentesco usado cuando el estudiante mayor de 16 años consiente de forma autónoma.
export const ESTUDIANTE_TITULAR_PARENTESCO =
  "Estudiante (Titular mayor de 16 años)";

export function isAutonomousParentesco(parentesco: string): boolean {
  const p = parentesco.trim();
  return (
    p === ESTUDIANTE_TITULAR_PARENTESCO ||
    p.startsWith("Estudiante (Titular")
  );
}

export const PARENTESCOS = [
  "Madre",
  "Padre",
  "Tutor(a) legal",
  "Apoderado(a)",
  "Abuelo(a)",
  "Otro",
] as const;

export interface ConsentSection {
  titulo: string;
  parrafos: string[];
}

// Información del responsable, del Encargado de Protección de Datos (DPO) y, si
// corresponde, del proveedor que actúa como Encargado del Tratamiento.
export interface ConsentOrgInfo {
  establecimiento: string;
  responsable?: string; // responsable del tratamiento (si difiere)
  dpoNombre?: string; // Encargado de Protección de Datos
  dpoContacto?: string; // correo, teléfono o dirección de contacto
  // Proveedor externo que procesa los datos (Encargado del Tratamiento). Si está
  // vacío, se entiende que el tratamiento es 100% interno del Establecimiento.
  proveedorNombre?: string;
  proveedorContacto?: string;
  // Plazo de eliminación (días corridos). Por defecto 30.
  retencionDias?: number;
}

// Construye el texto informativo del tratamiento (RGPD/Ley 21.719). Se usa
// tanto en la política pública como en el documento físico de autorización.
// Acepta el nombre del establecimiento (compatibilidad) o el objeto completo.
export function getConsentSections(
  info: ConsentOrgInfo | string
): ConsentSection[] {
  const org: ConsentOrgInfo =
    typeof info === "string" ? { establecimiento: info } : info;
  const establecimiento = (org.establecimiento || "").trim();
  const resp =
    (org.responsable || "").trim() ||
    establecimiento ||
    "el establecimiento educacional";

  // Frase de contacto para ejercer derechos (usa DPO si está configurado).
  const dpo = (org.dpoNombre || "").trim();
  const contacto = (org.dpoContacto || "").trim();
  const contactoFrase = contacto
    ? `Para consultas o para ejercer tus derechos, puede dirigirse al correo ` +
      `electrónico dedicado a este fin: ${contacto}` +
      `${dpo ? ` (${dpo})` : ""}, o a la dirección física del Establecimiento.`
    : `Para consultas o para ejercer tus derechos, dirígete a la dirección del ` +
      `Establecimiento o a su Encargado de Protección de Datos.`;

  // Cláusula de proveedor (Encargado del Tratamiento) si existe uno externo.
  const proveedor = (org.proveedorNombre || "").trim();
  const finalidadCesion = proveedor
    ? `Los datos no se comercializan. Podrán ser accedidos únicamente por el ` +
      `personal autorizado del Establecimiento y, en su caso, por ${proveedor}, ` +
      `que actúa como Encargado del Tratamiento bajo estrictas obligaciones de ` +
      `confidencialidad y seguridad, sin poder utilizar los datos para fines ` +
      `propios.`
    : `Los datos no se utilizan para ninguna otra finalidad, no se ` +
      `comercializan ni se ceden a terceros, salvo obligación legal.`;

  // Plazo concreto de eliminación.
  const dias =
    Number.isFinite(Number(org.retencionDias)) && Number(org.retencionDias) > 0
      ? Math.floor(Number(org.retencionDias))
      : RETENCION_DIAS_DEFAULT;

  return [
    {
      titulo: "1. Responsable del tratamiento",
      parrafos: [
        `El responsable del tratamiento de los datos personales es ${resp} ` +
          `(en adelante, "el Establecimiento"). ${contactoFrase}`,
      ],
    },
    {
      titulo: "2. Qué datos se tratan",
      parrafos: [
        "Para el funcionamiento del sistema se tratan los siguientes datos del " +
          "estudiante: nombre, apellidos, RUT, curso y un descriptor facial.",
        "El descriptor facial es un vector matemático (512 números) que el " +
          "sistema calcula a partir de una imagen del rostro tomada en el momento " +
          "del registro. NO se almacena la fotografía ni la imagen del rostro: el " +
          "cálculo del descriptor ocurre en el propio dispositivo y solo se guarda " +
          "ese vector. El descriptor facial es un dato personal sensible de " +
          "carácter biométrico conforme a la Ley N° 21.719.",
      ],
    },
    {
      titulo: "3. Finalidad",
      parrafos: [
        "Los datos se utilizan exclusivamente para identificar al estudiante al " +
          "momento de entregarle beneficios o registrar su participación en " +
          "programas del Establecimiento (por ejemplo, el almuerzo escolar), " +
          "evitando suplantaciones y agilizando la entrega.",
        finalidadCesion,
      ],
    },
    {
      titulo: "4. Base de licitud",
      parrafos: [
        "El tratamiento de datos biométricos de un menor de edad se realiza sobre " +
          "la base del consentimiento expreso, específico e informado otorgado por " +
          "su padre, madre o representante legal, conforme a los artículos sobre " +
          "datos sensibles y protección de menores de la Ley N° 21.719.",
      ],
    },
    {
      titulo: "5. Carácter voluntario y alternativa",
      parrafos: [
        "El uso del reconocimiento facial es VOLUNTARIO. Si el apoderado no " +
          "autoriza el tratamiento biométrico, el estudiante igualmente podrá " +
          "acceder a los beneficios mediante un método alternativo no biométrico " +
          "(por ejemplo, verificación manual de identidad por el personal).",
      ],
    },
    {
      titulo: "6. Conservación",
      parrafos: [
        "El descriptor facial se conserva mientras el estudiante participe en los " +
          "programas del Establecimiento y se mantenga vigente esta autorización. " +
          `Se eliminará de los sistemas activos y de respaldo en un plazo no mayor ` +
          `a ${dias} días corridos desde que el estudiante egrese, deje de recibir ` +
          `el beneficio, o desde que el apoderado formalice la revocación del ` +
          `consentimiento.`,
      ],
    },
    {
      titulo: "7. Seguridad",
      parrafos: [
        "El Establecimiento adopta medidas de seguridad para proteger los datos: " +
          "control de acceso restringido, transmisión cifrada y separación del " +
          "descriptor facial respecto del resto de la información.",
      ],
    },
    {
      titulo: "8. Derechos del titular",
      parrafos: [
        "El estudiante, a través de su apoderado, puede ejercer en cualquier " +
          "momento los derechos de acceso, rectificación, supresión (eliminación), " +
          "oposición y portabilidad de sus datos, así como revocar este " +
          "consentimiento. La revocación no afecta la licitud del tratamiento " +
          "realizado antes de ella.",
        "Las solicitudes se responden en los plazos que establece la ley. " +
          contactoFrase,
      ],
    },
  ];
}

// Valida que un override de texto tenga la forma esperada (secciones no vacías).
export function isValidConsentSections(value: unknown): value is ConsentSection[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(
    (s) =>
      s &&
      typeof (s as ConsentSection).titulo === "string" &&
      Array.isArray((s as ConsentSection).parrafos) &&
      (s as ConsentSection).parrafos.every((p) => typeof p === "string")
  );
}

// Devuelve el texto efectivo: el override del establecimiento si existe y es
// válido; en caso contrario, el texto generado a partir de los datos de la
// organización (con los valores dinámicos: DPO, proveedor, plazo, etc.).
export function resolveConsentSections(
  info: ConsentOrgInfo | string,
  override?: ConsentSection[] | null
): ConsentSection[] {
  if (isValidConsentSections(override)) return override;
  return getConsentSections(info);
}

// Resumen corto para mostrar el estado de la autorización en la interfaz.
export function consentStatusLabel(status: ConsentStatus | undefined): string {
  switch (status) {
    case "otorgado":
      return "Autorizado";
    case "revocado":
      return "Revocado";
    default:
      return "Pendiente";
  }
}

// Calcula la edad en años a partir de la fecha de nacimiento (YYYY-MM-DD).
export function calculateAge(fechaNacimiento: string): number {
  if (!fechaNacimiento) return 0;
  const birth = new Date(fechaNacimiento + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

// Clasifica el nivel de autonomía según la edad (Ley 21.719 / 21.430).
export function getAutonomyTier(age: number): "tutela" | "progresiva" | "plena" {
  if (age >= 16) return "plena";
  if (age >= 14) return "progresiva";
  return "tutela";
}

export interface ChildExplanationSection {
  pregunta: string;
  respuesta: string;
}

// Explicación en lenguaje claro y adaptado para menores de edad (Ley 21.430).
export const CHILD_EXPLANATION: ChildExplanationSection[] = [
  {
    pregunta: "👦👧 ¿Qué es esto y para qué sirve?",
    respuesta: "Para entrar a almorzar de forma rápida y sin hacer fila, usaremos una tablet con una cámara que reconoce tu cara al pasar."
  },
  {
    pregunta: "📸 ¿Se guardará mi foto o video?",
    respuesta: "¡No! El sistema no guarda fotos tuyas. Solo convierte tu rostro en un código de números secretos que no sirve para nada fuera de la escuela."
  },
  {
    pregunta: "✋ ¿Es obligatorio?",
    respuesta: "No, es completamente voluntario. Si tú o tus papás no quieren usar la cara, puedes decírselo al profesor y podrás entrar al almuerzo dictando tu RUT."
  },
  {
    pregunta: "🗑️ ¿Puedo cambiar de opinión?",
    respuesta: "Sí, puedes pedir que se borren tus números en cualquier momento y volver al método del RUT sin ningún problema."
  }
];

