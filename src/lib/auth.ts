import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { CapKey, UserRole } from "./types";
import { getDb } from "./mongodb";
import { getRoleCaps } from "./roles";

const SECRET = process.env.AUTH_SECRET || "cambia-este-secreto-en-produccion";
const COOKIE_NAME = "almuerzo_session";
const MAX_AGE = 60 * 60 * 12; // 12 horas

export interface SessionPayload {
  userId: string;
  username: string;
  nombre: string;
  role: UserRole;
  // Si true, la sesión está limitada a cambiar la clave.
  mustChangePassword: boolean;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: MAX_AGE });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error("NO_AUTH");
  }
  return session;
}

// Verifica que la sesión tenga uno de los roles permitidos. Devuelve la sesión
// o null si no cumple (para que cada endpoint responda 401/403 a su manera).
export async function getSessionWithRole(
  roles: UserRole[]
): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (!roles.includes(session.role)) return null;
  return session;
}

// Verifica que el rol de la sesión tenga la capacidad/permiso indicado.
// El administrador siempre la tiene. Devuelve la sesión o null.
export async function getSessionWithCap(
  cap: CapKey
): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.role === "administrador") return session;
  const db = await getDb();
  const caps = await getRoleCaps(db, session.role);
  return caps[cap] ? session : null;
}
