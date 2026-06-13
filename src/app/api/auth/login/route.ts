import { NextRequest, NextResponse } from "next/server";
import { getAdminCredentials, signSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as {
    username?: string;
    password?: string;
  };

  const creds = getAdminCredentials();
  if (username === creds.username && password === creds.password) {
    const token = signSession({ username: creds.username, role: "admin" });
    await setSessionCookie(token);
    return NextResponse.json({ ok: true, username: creds.username });
  }

  return NextResponse.json(
    { ok: false, error: "Usuario o clave incorrectos" },
    { status: 401 }
  );
}
