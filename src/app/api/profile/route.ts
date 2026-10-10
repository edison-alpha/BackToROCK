import { cookies } from "next/headers";
import { auth } from "@/auth";
import { GOOGLE_LOGIN } from "@/lib/features";
import { isProfile, type Profile } from "@/lib/profile";

// Closed while Google login is switched off (src/lib/features.ts).
const off = () => new Response("Not found", { status: 404 });
const COOKIE = "btr_profile";
const YEAR = 60 * 60 * 24 * 365;

type Stored = Profile & { email: string };

// The onboarding answer lives in a cookie, tied to the Google account's email so another account on the
// same browser does not inherit them.
async function readStored(email: string): Promise<Profile | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Stored;
    return parsed.email === email && isProfile(parsed) ? { instrument: parsed.instrument } : null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!GOOGLE_LOGIN) return off();
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ profile: null }, { status: 401 });
  return Response.json({ profile: await readStored(email) });
}

export async function POST(request: Request) {
  if (!GOOGLE_LOGIN) return off();
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ error: "Belum login" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!isProfile(body)) return Response.json({ error: "Data tidak valid" }, { status: 400 });

  const value: Stored = { instrument: body.instrument, email };
  (await cookies()).set(COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: YEAR,
  });
  return Response.json({ profile: { instrument: body.instrument } });
}

export async function DELETE() {
  if (!GOOGLE_LOGIN) return off();
  (await cookies()).delete(COOKIE);
  return Response.json({ ok: true });
}
