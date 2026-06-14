import type { Db } from "mongodb";
import { CAP_KEYS } from "./types";
import type { CapKey, Role, RoleCaps } from "./types";

function caps(on: CapKey[]): RoleCaps {
  const out = {} as RoleCaps;
  for (const k of CAP_KEYS) out[k] = on.includes(k);
  return out;
}

function fullCaps(): RoleCaps {
  return caps([...CAP_KEYS]);
}

export const ADMIN_ROLE = "administrador";

// Roles base que se siembran la primera vez. El administrador siempre tiene
// todo y no se puede limitar ni eliminar.
const DEFAULT_ROLES: Role[] = [
  { key: "administrador", label: "Administrador", caps: fullCaps(), builtin: true },
  {
    key: "coordinador",
    label: "Coordinador",
    caps: caps(["operacion", "programas", "enrolar", "estudiantes", "cursos"]),
    builtin: true,
  },
  {
    key: "docente",
    label: "Docente",
    caps: caps(["operacion", "enrolar", "estudiantes"]),
    builtin: true,
  },
];

// Normaliza unos caps cualquiera al conjunto completo de claves (faltantes=false).
function normalizeCaps(input: unknown): RoleCaps {
  const src = (input || {}) as Record<string, unknown>;
  const out = {} as RoleCaps;
  for (const k of CAP_KEYS) out[k] = Boolean(src[k]);
  return out;
}

export function slugifyRoleKey(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function ensureSeedRoles(db: Db): Promise<void> {
  const coll = db.collection("roles");
  for (const r of DEFAULT_ROLES) {
    const exists = await coll.findOne({ key: r.key });
    if (!exists)
      await coll.insertOne({
        key: r.key,
        label: r.label,
        caps: r.caps,
        builtin: r.builtin,
      });
  }
  // El administrador siempre debe tener todos los permisos.
  await coll.updateOne(
    { key: ADMIN_ROLE },
    { $set: { caps: fullCaps(), builtin: true } }
  );
}

export async function listRoles(db: Db): Promise<Role[]> {
  await ensureSeedRoles(db);
  const docs = await db.collection("roles").find({}).toArray();
  return docs
    .map((d) => ({
      _id: String(d._id),
      key: d.key,
      label: d.label || d.key,
      caps: normalizeCaps(d.caps),
      builtin: Boolean(d.builtin),
    }))
    .sort((a, b) => {
      // Base primero, luego alfabético.
      if (a.builtin !== b.builtin) return a.builtin ? -1 : 1;
      return a.label.localeCompare(b.label, "es");
    });
}

// Capacidades de un rol (el administrador siempre tiene todo).
export async function getRoleCaps(db: Db, key: string): Promise<RoleCaps> {
  if (key === ADMIN_ROLE) return fullCaps();
  const doc = await db.collection("roles").findOne({ key });
  if (doc) return normalizeCaps(doc.caps);
  const def = DEFAULT_ROLES.find((r) => r.key === key);
  return def ? def.caps : normalizeCaps({});
}

export async function roleExists(db: Db, key: string): Promise<boolean> {
  if (!key) return false;
  const doc = await db.collection("roles").findOne({ key }, { projection: { _id: 1 } });
  return Boolean(doc);
}

export async function createRole(
  db: Db,
  label: string,
  capsInput: unknown
): Promise<{ ok: boolean; key?: string; error?: string }> {
  const clean = (label || "").trim();
  if (!clean) return { ok: false, error: "Escribe un nombre para el rol." };
  const key = slugifyRoleKey(clean);
  if (!key) return { ok: false, error: "Nombre de rol inválido." };
  if (await roleExists(db, key))
    return { ok: false, error: "Ya existe un rol con ese nombre." };
  await db.collection("roles").insertOne({
    key,
    label: clean,
    caps: normalizeCaps(capsInput),
    builtin: false,
  });
  return { ok: true, key };
}

export async function updateRole(
  db: Db,
  key: string,
  patch: { label?: string; caps?: unknown }
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (typeof patch.label === "string" && patch.label.trim())
    set.label = patch.label.trim();
  if (patch.caps !== undefined) set.caps = normalizeCaps(patch.caps);
  // Nunca se limita al administrador.
  if (key === ADMIN_ROLE) set.caps = fullCaps();
  if (Object.keys(set).length)
    await db.collection("roles").updateOne({ key }, { $set: set });
}

export async function deleteRole(
  db: Db,
  key: string
): Promise<{ ok: boolean; error?: string }> {
  const doc = await db.collection("roles").findOne({ key });
  if (!doc) return { ok: false, error: "El rol no existe." };
  if (doc.builtin)
    return { ok: false, error: "Los roles base no se pueden eliminar." };
  const inUse = await db
    .collection("users")
    .countDocuments({ role: key }, { limit: 1 });
  if (inUse > 0)
    return {
      ok: false,
      error: "Hay usuarios con este rol. Cámbiales el rol antes de eliminarlo.",
    };
  await db.collection("roles").deleteOne({ key });
  return { ok: true };
}
