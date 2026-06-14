"use client";

import { useEffect, useState } from "react";

export default function AjustesTab() {
  // Umbral de cara duplicada en porcentaje (se guarda como fracción 0–1).
  const [umbralCara, setUmbralCara] = useState(75);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.umbralCaraDuplicada)
          setUmbralCara(Math.round(Number(data.umbralCaraDuplicada) * 100));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          umbralCaraDuplicada: umbralCara / 100,
        }),
      });
      if (res.ok) setMsg("✅ Guardado");
      else setMsg("No se pudo guardar");
    } catch {
      setMsg("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-pop max-w-xl mx-auto">
      <div className="card p-6">
        <h3 className="text-xl font-black text-[#27407a] mb-1">
          Detección de cara duplicada
        </h3>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          Al enrolar, el sistema bloquea una cara que sea casi idéntica a otra
          ya registrada (suplantación). Un valor más alto es más estricto y deja
          pasar a gemelos y hermanos parecidos; uno más bajo bloquea más fácil.
          Recomendado: <strong>75%</strong>.
        </p>
        {!loading && (
          <div className="flex-1">
            <label className="label-game">
              Considerar &quot;misma cara&quot; si la similitud supera (%)
            </label>
            <input
              type="number"
              min={50}
              max={99}
              className="input-game"
              value={umbralCara}
              onChange={(e) => setUmbralCara(Number(e.target.value))}
            />
          </div>
        )}

        {!loading && (
          <button
            onClick={save}
            disabled={saving}
            className="btn-game btn-blue mt-4 w-full"
          >
            {saving ? "Guardando..." : "Guardar ajustes"}
          </button>
        )}

        {msg && (
          <div className="mt-3 font-bold text-center text-[#22a558]">{msg}</div>
        )}
      </div>
    </div>
  );
}
