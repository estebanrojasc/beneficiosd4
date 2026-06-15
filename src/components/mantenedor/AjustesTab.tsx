"use client";

import { useEffect, useState } from "react";
import { refreshBrandingAssets } from "@/components/Brand";

// Límite de imagen original antes de redimensionar (evita lecturas enormes).
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Hace transparente el fondo/contorno blanco: rellena desde los bordes hacia
// adentro mientras los píxeles sean casi blancos. No toca el blanco "interior"
// del logo (el que no está conectado al borde), para no dañarlo.
function removeWhiteBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  const isWhite = (i: number) =>
    d[i] > 238 && d[i + 1] > 238 && d[i + 2] > 238 && d[i + 3] > 10;

  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    visited[p] = 1;
    const i = p * 4;
    if (isWhite(i)) {
      d[i + 3] = 0; // transparente
      stack.push(x, y);
    }
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  ctx.putImageData(img, 0, 0);
}

// Redimensiona la imagen a un máximo y la devuelve como data URL liviano (PNG),
// quitando el fondo blanco que rodea al logo.
function fileToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const max = 400;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        try {
          removeWhiteBackground(ctx, w, h);
        } catch {
          // Si falla (p. ej. canvas "tainted"), guardamos la imagen tal cual.
        }
        // WebP comprime mucho manteniendo transparencia y calidad. Si el
        // navegador no lo soporta, toDataURL devuelve PNG automáticamente.
        const webp = canvas.toDataURL("image/webp", 0.9);
        resolve(
          webp.startsWith("data:image/webp")
            ? webp
            : canvas.toDataURL("image/png")
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AjustesTab() {
  // Umbral de cara duplicada en porcentaje (se guarda como fracción 0–1).
  const [umbralCara, setUmbralCara] = useState(75);
  const [nombreEst, setNombreEst] = useState("");
  const [logo, setLogo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.umbralCaraDuplicada)
          setUmbralCara(Math.round(Number(data.umbralCaraDuplicada) * 100));
        if (typeof data?.establecimientoNombre === "string")
          setNombreEst(data.establecimientoNombre);
        if (typeof data?.logo === "string") setLogo(data.logo);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg("El logo debe ser una imagen.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMsg("La imagen es muy grande (máx. 5 MB).");
      return;
    }
    try {
      setLogo(await fileToLogoDataUrl(file));
      setMsg("");
    } catch {
      setMsg("No se pudo procesar la imagen.");
    }
  }

  async function save() {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          umbralCaraDuplicada: umbralCara / 100,
          establecimientoNombre: nombreEst,
          logo,
        }),
      });
      if (res.ok) {
        setMsg("✅ Guardado");
        // Actualiza logo, favicon y título en esta pestaña sin limpiar caché.
        await refreshBrandingAssets();
      } else setMsg("No se pudo guardar");
    } catch {
      setMsg("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-pop max-w-xl mx-auto space-y-5">
      <div className="card p-6">
        <h3 className="text-xl font-black text-[#27407a] mb-1">
          Datos del establecimiento
        </h3>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          El nombre y el logo se usan en los reportes y para personalizar el
          sistema.
        </p>
        {!loading && (
          <>
            <label className="label-game">Nombre del establecimiento</label>
            <input
              className="input-game mb-4"
              value={nombreEst}
              onChange={(e) => setNombreEst(e.target.value)}
              placeholder="Ej: Colegio San Mateo"
            />

            <label className="label-game">Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-2xl border-2 border-[#eef2ff] bg-[#f6f8ff] flex items-center justify-center overflow-hidden shrink-0">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logo}
                    alt="Logo"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-2xl">🏫</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="btn-game btn-gray !py-2 !px-3 cursor-pointer text-sm">
                  📁 Subir imagen
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onLogoFile}
                  />
                </label>
                {logo && (
                  <button
                    onClick={() => setLogo("")}
                    className="btn-game btn-red !py-2 !px-3 text-sm"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

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
