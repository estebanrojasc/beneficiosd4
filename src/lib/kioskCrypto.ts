"use client";

// Cifrado de la caché local de descriptores en la tablet del kiosko.
//
// Los descriptores llegan descifrados desde el servidor para poder reconocer
// caras sin conexión. Para no dejar datos biométricos en claro dentro de
// IndexedDB, se cifran en reposo con AES-GCM usando una clave derivada (PBKDF2)
// de la clave del validador del programa. Sin esa clave, la copia local es
// ilegible. La clave NUNCA se guarda en IndexedDB; solo la sal (que no es secreta).

export interface EncryptedBlob {
  iv: string; // base64
  ct: string; // base64
}

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function isCryptoAvailable(): boolean {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof crypto.subtle.deriveKey === "function"
  );
}

// Genera una sal aleatoria (base64) para derivar la clave.
export function generateSalt(): string {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveKey(secret: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: b64ToBuf(saltB64),
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Cifra un objeto cualquiera. Devuelve null si Web Crypto no está disponible o
// falta el secreto (en ese caso, el llamador no debe cachear nada).
export async function encryptJSON(
  obj: unknown,
  secret: string,
  saltB64: string
): Promise<EncryptedBlob | null> {
  if (!isCryptoAvailable() || !secret) return null;
  try {
    const key = await deriveKey(secret, saltB64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
    return { iv: bufToB64(iv), ct: bufToB64(ct) };
  } catch {
    return null;
  }
}

// Descifra un blob. Devuelve null si la clave es incorrecta o el blob es inválido.
export async function decryptJSON<T>(
  blob: EncryptedBlob,
  secret: string,
  saltB64: string
): Promise<T | null> {
  if (!isCryptoAvailable() || !secret || !blob?.iv || !blob?.ct) return null;
  try {
    const key = await deriveKey(secret, saltB64);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBuf(blob.iv) },
      key,
      b64ToBuf(blob.ct)
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}
