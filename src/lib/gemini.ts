// Cliente mínimo de la API de Gemini (REST) para extracción estructurada.
// Lee configuración del entorno:
//   GEMINI_API_KEY   (obligatoria)
//   GEMINI_MODEL     (ej. gemini-3.1-flash-lite)
//   GEMINI_BASE_URL  (ej. https://generativelanguage.googleapis.com/v1beta)

const API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const BASE_URL =
  process.env.GEMINI_BASE_URL ||
  "https://generativelanguage.googleapis.com/v1beta";

export function geminiConfigured(): boolean {
  return Boolean(API_KEY);
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

// Esquema (subconjunto OpenAPI) que Gemini usa para forzar la salida JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Schema = Record<string, any>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Llama a generateContent con salida estructurada. Reintenta ante errores
// transitorios (429/503), comunes en el nivel gratuito.
export async function generateStructured(
  parts: GeminiPart[],
  schema: Schema,
  opts: { retries?: number } = {}
): Promise<string> {
  if (!API_KEY) throw new Error("GEMINI_NOT_CONFIGURED");

  const url = `${BASE_URL}/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: parts.map((p) =>
          p.inlineData
            ? { inline_data: { mime_type: p.inlineData.mimeType, data: p.inlineData.data } }
            : { text: p.text || "" }
        ),
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0,
    },
  };

  const maxRetries = opts.retries ?? 2;
  let lastErr = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status === 503 || res.status === 500) {
        lastErr = `Servicio ocupado (${res.status})`;
        await sleep(800 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`GEMINI_HTTP_${res.status}: ${t.slice(0, 300)}`);
      }
      const data = await res.json();
      const text: string | undefined =
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text || "")
          .join("") || undefined;
      if (!text) throw new Error("GEMINI_EMPTY");
      return text;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      // Errores de red: reintentamos; errores HTTP no-transitorios: cortamos.
      if (lastErr.startsWith("GEMINI_HTTP_")) throw err;
      await sleep(800 * (attempt + 1));
    }
  }
  throw new Error(lastErr || "GEMINI_FAILED");
}
