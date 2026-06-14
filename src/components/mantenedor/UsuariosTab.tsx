"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppUser, Role, UserRole } from "@/lib/types";

export default function UsuariosTab() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [username, setUsername] = useState("");
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState<UserRole>("docente");
  const [saving, setSaving] = useState(false);

  const roleLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of roles) m[r.key] = r.label;
    return m;
  }, [roles]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([
        fetch("/api/users", { cache: "no-store" }),
        fetch("/api/roles", { cache: "no-store" }),
      ]);
      if (!uRes.ok) {
        setError(
          uRes.status === 403
            ? "No tienes permiso para gestionar usuarios."
            : "No se pudo cargar la lista de usuarios."
        );
        setUsers([]);
        return;
      }
      setError("");
      setUsers(await uRes.json());
      if (rRes.ok) {
        const rs: Role[] = await rRes.json();
        setRoles(rs);
        // Si el rol elegido ya no existe, usamos el primero disponible.
        setRole((prev) =>
          rs.some((r) => r.key === prev) ? prev : rs[rs.length - 1]?.key || prev
        );
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setNotice("");
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, nombre, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo crear el usuario");
        return;
      }
      setNotice(
        `Usuario "${username}" creado. Clave inicial: ${data.initialPassword} ` +
          `(deberá cambiarla en el primer ingreso).`
      );
      setUsername("");
      setNombre("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(u: AppUser) {
    if (!confirm(`¿Reiniciar la clave de "${u.username}"?`)) return;
    const res = await fetch(`/api/users/${u._id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setNotice(
        `Clave de "${u.username}" reiniciada a: ${data.initialPassword} ` +
          `(deberá cambiarla al ingresar).`
      );
    } else {
      setError(data.error || "No se pudo reiniciar la clave");
    }
  }

  async function changeRole(u: AppUser, next: UserRole) {
    await fetch(`/api/users/${u._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: next }),
    });
    await load();
  }

  async function toggleActive(u: AppUser) {
    await fetch(`/api/users/${u._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    await load();
  }

  async function remove(u: AppUser) {
    if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
    const res = await fetch(`/api/users/${u._id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error || "No se pudo eliminar");
    await load();
  }

  return (
    <div className="animate-pop space-y-5">
      <div className="card p-5">
        <h2 className="text-xl font-black text-[#27407a] mb-1">Crear usuario</h2>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          Se crea con una clave por defecto que el usuario deberá cambiar en su
          primer ingreso.
        </p>
        <form onSubmit={create} className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label-game">Usuario</label>
            <input
              className="input-game"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jperez"
            />
          </div>
          <div>
            <label className="label-game">Nombre</label>
            <input
              className="input-game"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Juana Pérez"
            />
          </div>
          <div>
            <label className="label-game">Rol</label>
            <select
              className="input-game"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="btn-game btn-blue"
          >
            {saving ? "Creando..." : "➕ Crear"}
          </button>
        </form>
      </div>

      {notice && (
        <div className="rounded-2xl bg-[#eafaf0] border-2 border-[#bde8cd] p-4 font-bold text-[#1c7a44]">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-2xl bg-[#fdeaea] border-2 border-[#f5b5b5] p-4 font-bold text-[#c0392b]">
          {error}
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-xl font-black text-[#27407a] mb-3">Usuarios</h2>
        {loading ? (
          <div className="text-[#6b7aa0] font-bold py-6">Cargando...</div>
        ) : users.length === 0 ? (
          <div className="text-[#6b7aa0] font-bold py-6">Sin usuarios.</div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u._id}
                className={`rounded-2xl border-2 p-3 flex flex-wrap items-center gap-2 ${
                  u.active
                    ? "bg-white border-[#eef2ff]"
                    : "bg-[#f6f7fb] border-[#e3e7f2] opacity-70"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[#27407a] truncate">
                    {u.nombre}{" "}
                    <span className="text-[#9aa6bf] font-bold">
                      @{u.username}
                    </span>
                  </div>
                  <div className="text-xs text-[#9aa6bf] font-semibold">
                    {u.mustChangePassword
                      ? "Debe cambiar su clave"
                      : u.lastLogin
                      ? `Último ingreso: ${new Date(
                          u.lastLogin
                        ).toLocaleString("es-CL")}`
                      : "Nunca ingresó"}
                  </div>
                </div>
                <select
                  className="input-game !py-1.5 !w-auto"
                  value={u.role}
                  onChange={(e) => changeRole(u, e.target.value as UserRole)}
                >
                  {/* Si el usuario tuviera un rol ya eliminado, lo mostramos igual. */}
                  {!roles.some((r) => r.key === u.role) && (
                    <option value={u.role}>
                      {roleLabel[u.role] || u.role}
                    </option>
                  )}
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => resetPassword(u)}
                  className="btn-game btn-gray !py-1.5 !px-3 !text-sm"
                  title="Reiniciar clave"
                >
                  🔑 Clave
                </button>
                <button
                  onClick={() => toggleActive(u)}
                  className="btn-game btn-gray !py-1.5 !px-3 !text-sm"
                >
                  {u.active ? "🚫 Desactivar" : "✅ Activar"}
                </button>
                <button
                  onClick={() => remove(u)}
                  className="btn-game btn-red !py-1.5 !px-3 !text-sm"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
