// Cifrado en reposo del descriptor facial (dato biométrico sensible).
//
// SOLO SERVIDOR. No importar desde componentes de cliente.
//
// El descriptor (512 floats) se serializa y se cifra con AES-256-GCM. El valor
// guardado en la base es un string con el formato:
//     enc:v1:<base64(iv | authTag | ciphertext)>
//
// Compatibilidad: los datos antiguos están guardados como arreglo de números
// (texto plano). Las funciones de lectura aceptan ambos formatos, de modo que
// la migración puede hacerse de forma gradual.
import crypto from "node:crypto";

const PREFIX = "enc:v1:";
const IV_LEN = 12; // GCM estándar
const TAG_LEN = 16;
// Sal fija para derivar la clave. NO es secreta; el secreto es la llave.
const SALT = "almuerzo-descriptor-v1";

let cachedKey: Buffer | null = null;
let warnedNoKey = false;

// Deriva una clave de 32 bytes a partir del secreto configurado. Usa
// DATA_ENCRYPTION_KEY y, si no existe, cae en AUTH_SECRET. Debe ser ESTABLE:
// si cambia, los descriptores ya cifrados dejan de poder descifrarse.
function getKey(): Buffer | null {
  if (cachedKey) return cachedKey;
  const secret = process.env.DATA_ENCRYPTION_KEY || process.env.AUTH_SECRET;
  if (!secret) {
    if (!warnedNoKey) {
      console.warn(
        "[crypto] No hay DATA_ENCRYPTION_KEY ni AUTH_SECRET: el descriptor " +
          "facial se guardará SIN cifrar. Configura una llave en .env.local."
      );
      warnedNoKey = true;
    }
    return null;
  }
  cachedKey = crypto.scryptSync(secret, SALT, 32);
  return cachedKey;
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

// Cifra un descriptor (arreglo de números) y devuelve el string almacenable.
// Si no hay llave configurada, devuelve el arreglo tal cual (texto plano).
export function encryptDescriptor(
  descriptor: number[]
): string | number[] {
  const key = getKey();
  if (!key) return descriptor;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(descriptor), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]).toString("base64");
  return PREFIX + packed;
}

// ¿El valor almacenado está cifrado?
export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

// Descifra (o pasa a través) un valor de la base y devuelve el descriptor como
// arreglo de números. Acepta:
//   - string cifrado (enc:v1:...)  → lo descifra
//   - arreglo de números (legado)  → lo devuelve igual
//   - cualquier otra cosa          → null
export function decryptDescriptor(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (!isEncrypted(value)) return null;
  const key = getKey();
  if (!key) return null;
  try {
    const packed = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = packed.subarray(0, IV_LEN);
    const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const parsed = JSON.parse(plaintext.toString("utf8"));
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}
