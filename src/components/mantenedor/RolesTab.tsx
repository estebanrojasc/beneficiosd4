"use client";

import { useCallback, useEffect, useState } from "react";
import { CAP_KEYS, CAP_LABELS } from "@/lib/types";
import type { CapKey, Role, RoleCaps } from "@/lib/types";

function emptyCaps(): RoleCaps {
  const c = {} as RoleCaps;
  for (const k of CAP_KEYS) c[k] = false;
  return c;
}

export default function RolesTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Rol nuevo.
  const [newLabel, setNewLabel] = useState("");
  const [newCaps, setNewCaps] = useState<RoleCaps>(emptyCaps());
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/roles", { cache: "no-store" });
      if (!res.ok) {
        setError(
          res.status === 403
            ? "No tienes permiso para gestionar roles."
            : "No se pudieron cargar los roles."
        );
        setRoles([]);
        return;
      }
      setError("");
      setRoles(await res.json());
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

  // Cambia un permiso de un rol existente (en memoria; se guarda con el botón).
  function toggleCap(key: string, cap: CapKey) {
    setRoles((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, caps: { ...r.caps, [cap]: !r.caps[cap] } } : r
      )
    );
  }

  async function saveRole(r: Role) {
    setSavingKey(r.key);
    setError("");
    try {
      const res = await fetch(`/api/roles/${encodeURIComponent(r.key)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caps: r.caps }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message || d.error || "No se pudo guardar el rol.");
      } else {
        await load();
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function removeRole(r: Role) {
    if (!confirm(`¿Eliminar el rol "${r.label}"?`)) return;
    const res = await fetch(`/api/roles/${encodeURIComponent(r.key)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.message || d.error || "No se pudo eliminar el rol.");
      return;
    }
    setError("");
    await load();
  }

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel, caps: newCaps }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.message || d.error || "No se pudo crear el rol.");
        return;
      }
      setNewLabel("");
      setNewCaps(emptyCaps());
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="animate-pop space-y-5">
      <div className="card p-5">
        <h2 className="text-xl font-black text-[#27407a] mb-1">Crear rol</h2>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          Define un rol y marca las secciones a las que tendrá acceso. Podrás
          ajustar los permisos después en la matriz.
        </p>
        <form onSubmit={createRole} className="space-y-3">
          <div className="max-w-sm">
            <label className="label-game">Nombre del rol</label>
            <input
              className="input-game"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Ej: Inspector"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CAP_KEYS.map((cap) => (
              <label
                key={cap}
                className={`cursor-pointer select-none rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${
                  newCaps[cap]
                    ? "bg-[#eaf1ff] border-[#9bbcff] text-[#27407a]"
                    : "bg-white border-[#eef2ff] text-[#6b7aa0]"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={newCaps[cap]}
                  onChange={() =>
                    setNewCaps((c) => ({ ...c, [cap]: !c[cap] }))
                  }
                />
                {newCaps[cap] ? "✓ " : ""}
                {CAP_LABELS[cap]}
              </label>
            ))}
          </div>
          <button type="submit" disabled={creating} className="btn-game btn-blue">
            {creating ? "Creando..." : "➕ Crear rol"}
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-2xl bg-[#fdeaea] border-2 border-[#f5b5b5] p-4 font-bold text-[#c0392b]">
          {error}
        </div>
      )}

      <div className="card p-5">
        <h2 className="text-xl font-black text-[#27407a] mb-1">
          Matriz de permisos
        </h2>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          Marca qué puede hacer cada rol. El administrador siempre tiene acceso
          total.
        </p>
        {loading ? (
          <div className="text-[#6b7aa0] font-bold py-6">Cargando...</div>
        ) : roles.length === 0 ? (
          <div className="text-[#6b7aa0] font-bold py-6">Sin roles.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left p-2 font-black text-[#27407a]">
                    Rol
                  </th>
                  {CAP_KEYS.map((cap) => (
                    <th
                      key={cap}
                      className="p-2 font-bold text-[#41507a] text-center min-w-[92px] align-bottom"
                    >
                      {CAP_LABELS[cap]}
                    </th>
                  ))}
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => {
                  const locked = r.key === "administrador";
                  return (
                    <tr key={r.key} className="border-t-2 border-[#eef2ff]">
                      <td className="sticky left-0 z-10 bg-white p-2 align-middle">
                        <div className="font-black text-[#27407a]">
                          {r.label}
                        </div>
                        <div className="text-xs text-[#9aa6bf] font-semibold">
                          {r.builtin ? "Base" : "Personalizado"}
                        </div>
                      </td>
                      {CAP_KEYS.map((cap) => (
                        <td key={cap} className="p-2 text-center align-middle">
                          <input
                            type="checkbox"
                            className="h-5 w-5 accent-[#4f7cff] disabled:opacity-60"
                            checked={locked ? true : r.caps[cap]}
                            disabled={locked}
                            onChange={() => toggleCap(r.key, cap)}
                          />
                        </td>
                      ))}
                      <td className="p-2 text-right align-middle whitespace-nowrap">
                        {!locked && (
                          <div className="inline-flex gap-1">
                            <button
                              onClick={() => saveRole(r)}
                              disabled={savingKey === r.key}
                              className="btn-game btn-blue !py-1.5 !px-3 !text-sm"
                            >
                              {savingKey === r.key ? "..." : "Guardar"}
                            </button>
                            {!r.builtin && (
                              <button
                                onClick={() => removeRole(r)}
                                className="btn-game btn-red !py-1.5 !px-3 !text-sm"
                                title="Eliminar rol"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
