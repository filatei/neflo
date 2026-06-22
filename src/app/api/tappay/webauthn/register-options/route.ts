import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentMembership } from "@/lib/merchant";
import { buildRegistrationOptions, WEBAUTHN_REG_COOKIE } from "@/lib/tappay/webauthn";

export const dynamic = "force-dynamic";

/** Issue WebAuthn registration options + stash the challenge for verification. */
export async function GET() {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const options = await buildRegistrationOptions(m.userId, m.merchant.name);
  const jar = await cookies();
  jar.set(WEBAUTHN_REG_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return NextResponse.json(options);
}
