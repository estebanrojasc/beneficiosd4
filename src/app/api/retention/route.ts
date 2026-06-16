import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionWithCap } from "@/lib/auth";
import { purgeBiometrics } from "@/lib/retention";

// Aplica la política de retención de biometría ahora (botón en Ajustes).
// También se puede ejecutar de forma programada con scripts/apply-retention.mjs.
export async function POST() {
  const session = await getSessionWithCap("ajustes");
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const db = await getDb();
  const result = await purgeBiometrics(db, {
    actor: session.username,
    actorType: "admin",
  });

  return NextResponse.json({ ok: true, ...result });
}
