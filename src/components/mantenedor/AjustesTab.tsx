"use client";

import { useEffect, useState } from "react";
import { refreshBrandingAssets } from "@/components/Brand";
import ConsentTextEditor from "@/components/mantenedor/ConsentTextEditor";
import {
  getConsentSections,
  resolveConsentSections,
  type ConsentSection,
} from "@/lib/consent";

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
  const [responsable, setResponsable] = useState("");
  const [dpoNombre, setDpoNombre] = useState("");
  const [dpoContacto, setDpoContacto] = useState("");
  const [retencionMeses, setRetencionMeses] = useState(0);
  const [purgaAnio, setPurgaAnio] = useState(false);
  const [proveedorNombre, setProveedorNombre] = useState("");
  const [proveedorContacto, setProveedorContacto] = useState("");
  const [consentTextos, setConsentTextos] = useState<ConsentSection[]>([]);
  const [canEditTextos, setCanEditTextos] = useState(false);
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [retMsg, setRetMsg] = useState("");
  const [retRunning, setRetRunning] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.umbralCaraDuplicada)
          setUmbralCara(Math.round(Number(data.umbralCaraDuplicada) * 100));
        if (typeof data?.establecimientoNombre === "string")
          setNombreEst(data.establecimientoNombre);
        if (typeof data?.logo === "string") setLogo(data.logo);
        if (typeof data?.responsableTratamiento === "string")
          setResponsable(data.responsableTratamiento);
        if (typeof data?.dpoNombre === "string") setDpoNombre(data.dpoNombre);
        if (typeof data?.dpoContacto === "string")
          setDpoContacto(data.dpoContacto);
        if (Number.isFinite(Number(data?.retencionMeses)))
          setRetencionMeses(Number(data.retencionMeses));
        setPurgaAnio(Boolean(data?.retencionPurgaAnioAnterior));
        if (typeof data?.proveedorNombre === "string")
          setProveedorNombre(data.proveedorNombre);
        if (typeof data?.proveedorContacto === "string")
          setProveedorContacto(data.proveedorContacto);
        if (Array.isArray(data?.consentTextos))
          setConsentTextos(data.consentTextos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCanEditTextos(Boolean(d?.caps?.textosLegales)))
      .catch(() => {});
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
          responsableTratamiento: responsable,
          dpoNombre,
          dpoContacto,
          retencionMeses,
          retencionPurgaAnioAnterior: purgaAnio,
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

  async function applyRetention() {
    if (
      !confirm(
        "Esto eliminará la biometría de los estudiantes que cumplan los " +
          "criterios de retención. No se puede deshacer. ¿Continuar?"
      )
    )
      return;
    setRetRunning(true);
    setRetMsg("");
    try {
      const res = await fetch("/api/retention", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRetMsg(
          data.purged > 0
            ? `✅ Biometría eliminada en ${data.purged} estudiante(s).`
            : "No había biometría que cumpliera los criterios."
        );
      } else {
        setRetMsg(data.error || "No se pudo aplicar la retención.");
      }
    } catch {
      setRetMsg("Error de conexión.");
    } finally {
      setRetRunning(false);
    }
  }

  const orgInfo = {
    establecimiento: nombreEst,
    responsable,
    dpoNombre,
    dpoContacto,
    proveedorNombre,
    proveedorContacto,
  };
  const defaultSections = getConsentSections(orgInfo);
  const effectiveSections = resolveConsentSections(orgInfo, consentTextos);
  const hasOverride = consentTextos.length > 0;

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

      <div className="card p-6">
        <h3 className="text-xl font-black text-[#27407a] mb-1">
          Protección de datos (Ley 21.719)
        </h3>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          Datos del responsable y del Encargado de Protección de Datos (DPO).
          Aparecen en la política de privacidad y en el documento de
          autorización que firma el apoderado.
        </p>
        {!loading && (
          <>
            <label className="label-game">
              Responsable del tratamiento (opcional)
            </label>
            <input
              className="input-game mb-4"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              placeholder="Si difiere del nombre del establecimiento"
            />

            <label className="label-game">
              Encargado de Protección de Datos (DPO)
            </label>
            <input
              className="input-game mb-4"
              value={dpoNombre}
              onChange={(e) => setDpoNombre(e.target.value)}
              placeholder="Ej: Juan Pérez / Dirección"
            />

            <label className="label-game">Contacto del DPO</label>
            <input
              className="input-game"
              value={dpoContacto}
              onChange={(e) => setDpoContacto(e.target.value)}
              placeholder="Correo, teléfono o dirección"
            />

            <button
              onClick={save}
              disabled={saving}
              className="btn-game btn-blue mt-4 w-full"
            >
              {saving ? "Guardando..." : "Guardar ajustes"}
            </button>

            <div className="mt-4 rounded-2xl bg-[#f6f8ff] p-3 text-sm">
              <div className="font-bold text-[#41507a]">
                Proveedor (Encargado del Tratamiento)
              </div>
              <div className="text-[#6b7aa0] font-semibold mt-1">
                {proveedorNombre ? (
                  <>
                    {proveedorNombre}
                    {proveedorContacto ? ` · ${proveedorContacto}` : ""}
                  </>
                ) : (
                  "Tratamiento 100% interno (no se ceden datos a terceros)."
                )}
              </div>
              <div className="text-[11px] text-[#9aa6bf] mt-1">
                Se configura en el archivo .env (PROVEEDOR_NOMBRE /
                PROVEEDOR_CONTACTO) y se refleja en el texto de autorización.
              </div>
            </div>

            {canEditTextos && (
              <button
                onClick={() => setShowTextEditor(true)}
                className="btn-game btn-gray mt-3 w-full"
              >
                ✍️ Editar texto de autorización
                {hasOverride ? " (personalizado)" : ""}
              </button>
            )}
          </>
        )}
      </div>

      <div className="card p-6">
        <h3 className="text-xl font-black text-[#27407a] mb-1">
          Retención de biometría
        </h3>
        <p className="text-sm text-[#6b7aa0] font-semibold mb-4">
          La ley exige no conservar datos biométricos más allá de lo necesario.
          Configura cuándo eliminarlos automáticamente. (Estos ajustes se
          guardan con el botón de arriba.)
        </p>
        {!loading && (
          <>
            <label className="flex items-center gap-2 font-bold text-[#41507a] mb-3">
              <input
                type="checkbox"
                checked={purgaAnio}
                onChange={(e) => setPurgaAnio(e.target.checked)}
                className="w-5 h-5"
              />
              Borrar biometría de cursos de años anteriores (fin de año escolar)
            </label>

            <label className="label-game">
              Borrar biometría sin actividad por (meses, 0 = sin límite)
            </label>
            <input
              type="number"
              min={0}
              max={240}
              className="input-game"
              value={retencionMeses}
              onChange={(e) => setRetencionMeses(Number(e.target.value))}
            />

            <button
              onClick={applyRetention}
              disabled={retRunning}
              className="btn-game btn-red mt-4 w-full"
            >
              {retRunning ? "Aplicando..." : "🗑️ Aplicar retención ahora"}
            </button>
            <p className="mt-2 text-xs text-[#9aa6bf] font-semibold">
              También puedes programarlo con{" "}
              <code>npm run retention:apply</code>.
            </p>
            {retMsg && (
              <div className="mt-3 font-bold text-center text-[#41507a]">
                {retMsg}
              </div>
            )}
          </>
        )}
      </div>

      {showTextEditor && (
        <ConsentTextEditor
          initial={effectiveSections}
          defaults={defaultSections}
          hasOverride={hasOverride}
          onClose={() => setShowTextEditor(false)}
          onSaved={() => {
            // Recarga el estado del override desde el servidor.
            fetch("/api/settings")
              .then((r) => (r.ok ? r.json() : null))
              .then((data) => {
                if (Array.isArray(data?.consentTextos))
                  setConsentTextos(data.consentTextos);
              })
              .catch(() => {});
          }}
        />
      )}
    </div>
  );
}
