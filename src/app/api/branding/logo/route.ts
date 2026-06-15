import { getDb } from "@/lib/mongodb";
import { getSettings } from "@/lib/settings";

// Siempre dinámico: el logo se lee de la configuración en cada request.
export const dynamic = "force-dynamic";

// Respaldo cuando aún no se ha cargado un logo: cuadrado azul con la inicial
// del establecimiento (o un punto). Sirve como favicon por defecto.
function fallbackSvg(nombre: string): string {
  const raw = (nombre.trim()[0] || "•").toUpperCase();
  const letter = raw.replace(/[<>&"']/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#4f7cff"/>
  <text x="32" y="33" font-family="Arial, sans-serif" font-size="36" font-weight="bold"
    fill="#ffffff" text-anchor="middle" dominant-baseline="central">${letter}</text>
</svg>`;
}

export async function GET(req: Request) {
  // Cuando la URL trae ?v=<version> (la del branding), podemos cachear de forma
  // inmutable: si cambia el logo, cambia la versión y por ende la URL.
  const versioned = new URL(req.url).searchParams.has("v");
  const imgCache = versioned
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300, must-revalidate";
  try {
    const db = await getDb();
    const { logo, establecimientoNombre } = await getSettings(db);
    const m = logo.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) {
      const buf = Buffer.from(m[2], "base64");
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": m[1],
          "Cache-Control": imgCache,
        },
      });
    }
    return new Response(fallbackSvg(establecimientoNombre), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=60, must-revalidate",
      },
    });
  } catch {
    return new Response(fallbackSvg(""), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
    });
  }
}
