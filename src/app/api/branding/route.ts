import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";

// Endpoint liviano de branding: nombre, si hay logo y una "versión" del logo
// para cachearlo de forma inmutable. NO devuelve el base64 del logo (que es
// pesado): la imagen se sirve aparte en /api/branding/logo.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const rows = await db
      .collection("settings")
      .aggregate([
        { $match: { key: "config" } },
        {
          $project: {
            _id: 0,
            name: { $ifNull: ["$establecimientoNombre", ""] },
            updatedAt: { $ifNull: ["$updatedAt", ""] },
            hasLogo: {
              $gt: [{ $strLenCP: { $ifNull: ["$logo", ""] } }, 0],
            },
          },
        },
      ])
      .toArray();

    const r = (rows[0] as
      | { name?: string; updatedAt?: string; hasLogo?: boolean }
      | undefined) || { name: "", updatedAt: "", hasLogo: false };

    // La versión cambia cuando cambia la configuración (incluido el logo).
    const logoVersion = r.hasLogo
      ? String(r.updatedAt || "1").replace(/\D/g, "").slice(-12) || "1"
      : "0";

    return NextResponse.json(
      { name: r.name || "", hasLogo: Boolean(r.hasLogo), logoVersion },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ name: "", hasLogo: false, logoVersion: "0" });
  }
}
