import type { Db } from "mongodb";
import bcrypt from "bcryptjs";
import type { AppUser, UserRole } from "./types";
import { USER_ROLES } from "./types";

// Clave por defecto que se entrega al crear un usuario o al reiniciarla.
// El usuario está obligado a cambiarla en su primer ingreso.
export const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || "cambiar123";

export function normalizeUsername(u: string): string {
  return (u || "").trim().toLowerCase();
}

export function isValidRole(role: unknown): role is UserRole {
  return typeof role === "string" && USER_ROLES.includes(role as UserRole);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

interface UserDoc {
  _id: import("mongodb").ObjectId;
  username: string;
  nombre: string;
  role: UserRole;
  active: boolean;
  passwordHash: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string | null;
}

// Convierte un documento de Mongo en el tipo público (sin el hash de la clave).
export function toPublicUser(doc: UserDoc): AppUser {
  return {
    _id: doc._id.toString(),
    username: doc.username,
    nombre: doc.nombre,
    role: doc.role,
    active: doc.active,
    mustChangePassword: doc.mustChangePassword,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastLogin: doc.lastLogin ?? null,
  };
}

// Crea, si no existe ningún usuario, un administrador inicial a partir de las
// credenciales del entorno (ADMIN_USERNAME / ADMIN_PASSWORD). Permite arrancar
// el sistema sin tener que sembrar la base manualmente.
export async function ensureSeedAdmin(db: Db): Promise<void> {
  const count = await db.collection("users").countDocuments({}, { limit: 1 });
  if (count > 0) return;

  const username = normalizeUsername(process.env.ADMIN_USERNAME || "admin");
  const password = process.env.ADMIN_PASSWORD || "almuerzo2026";
  const now = new Date().toISOString();
  await db.collection("users").insertOne({
    username,
    nombre: "Administrador",
    role: "administrador",
    active: true,
    passwordHash: await hashPassword(password),
    // El admin sembrado desde el entorno no se fuerza a cambiar la clave.
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    lastLogin: null,
  });
}

export async function findUserByUsername(
  db: Db,
  username: string
): Promise<UserDoc | null> {
  return db
    .collection<UserDoc>("users")
    .findOne({ username: normalizeUsername(username) });
}
