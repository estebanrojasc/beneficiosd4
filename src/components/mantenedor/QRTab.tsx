"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QRTab() {
  const [baseUrl, setBaseUrl] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [openEnroll, setOpenEnroll] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const timer = window.setTimeout(() => {
        setBaseUrl(`${window.location.origin}/enrolar`);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setOpenEnroll(Boolean(data.enrolamientoAbierto));
      })
      .catch(() => {});
  }, []);

  async function toggleOpenEnroll(next: boolean) {
    setSavingFlag(true);
    setOpenEnroll(next);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrolamientoAbierto: next }),
      });
      if (!res.ok) setOpenEnroll(!next);
    } catch {
      setOpenEnroll(!next);
    } finally {
      setSavingFlag(false);
    }
  }

  useEffect(() => {
    if (!baseUrl) return;
    QRCode.toDataURL(baseUrl, {
      width: 520,
      margin: 2,
      color: { dark: "#27407a", light: "#ffffff" },
    })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [baseUrl]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "qr-enrolamiento.png";
    a.click();
  }

  function printQR() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>QR Enrolamiento</title></head>
      <body style="text-align:center;font-family:sans-serif;padding:40px">
        <h1 style="color:#27407a">Enróla tu cara 🪪</h1>
        <p style="font-size:18px;color:#444">Escanea el código con tu celular</p>
        <img src="${dataUrl}" style="width:420px;height:420px" />
        <p style="color:#666">${baseUrl}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="animate-pop">
      <div className="card p-6 max-w-xl mx-auto text-center">
        <div className="text-5xl mb-2">🔳</div>
        <h2 className="text-2xl font-black text-[#27407a]">
          QR de auto-enrolamiento
        </h2>
        <p className="text-[#6b7aa0] font-semibold mt-1 mb-5">
          Imprime este código para que los estudiantes más grandes registren su
          cara desde su celular. El sistema valida su RUT automáticamente. El
          enrolamiento solo registra la identidad; no agrega a ningún programa.
        </p>

        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="QR enrolamiento"
            className="mx-auto rounded-2xl border-4 border-[#eef2ff] w-64 h-64"
          />
        ) : (
          <div className="text-[#6b7aa0] font-bold py-10">Generando QR...</div>
        )}

        <div className="mt-5">
          <label className="label-game text-left">Enlace del formulario</label>
          <input
            className="input-game text-center"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="text-xs text-[#9aa6bf] mt-1">
            Puedes editar el dominio si lo publicas en otra dirección.
          </p>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={download} className="btn-game btn-blue flex-1">
            ⬇️ Descargar
          </button>
          <button onClick={printQR} className="btn-game btn-purple flex-1">
            🖨️ Imprimir
          </button>
        </div>

        <div
          className={`mt-6 rounded-2xl p-4 text-left border-2 ${
            openEnroll
              ? "bg-[#fff8e6] border-[#ffe08a]"
              : "bg-[#f4f8ff] border-[#eef2ff]"
          }`}
        >
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={openEnroll}
              disabled={savingFlag}
              onChange={(e) => toggleOpenEnroll(e.target.checked)}
              className="w-6 h-6 mt-0.5 accent-[#f59e0b]"
            />
            <span>
              <span className="font-black text-[#27407a]">
                Permitir que cualquiera se enrole
              </span>
              <span className="block text-sm text-[#6b7aa0] font-semibold mt-0.5">
                Si está activo, cualquier estudiante puede registrar su cara
                aunque su RUT no esté cargado. Se le avisa que{" "}
                <strong>esto no lo agrega a ningún programa</strong>.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
