import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { getCurrentMembership } from "@/lib/merchant";
import { verifyRegistration, WEBAUTHN_REG_COOKIE } from "@/lib/tappay/webauthn";

export const dynamic = "force-dynamic";

/** Verify the attestation and store the user's new passkey. */
export async function POST(req: Request) {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as RegistrationResponseJSON | null;
  if (!body) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const jar = await cookies();
  const challenge = jar.get(WEBAUTHN_REG_COOKIE)?.value;
  jar.delete(WEBAUTHN_REG_COOKIE);
  if (!challenge) return NextResponse.json({ error: "challenge_missing" }, { status: 400 });

  const ok = await verifyRegistration(m.userId, body, challenge);
  if (!ok) return NextResponse.json({ error: "registration_failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
