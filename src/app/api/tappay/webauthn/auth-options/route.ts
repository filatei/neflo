import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentMembership } from "@/lib/merchant";
import {
  buildAuthenticationOptions,
  hasPasskeys,
  WEBAUTHN_AUTH_COOKIE,
} from "@/lib/tappay/webauthn";

export const dynamic = "force-dynamic";

/** Issue authentication options (the passkey challenge) for the pay step. */
export async function GET() {
  const m = await getCurrentMembership();
  if (!m) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!(await hasPasskeys(m.userId)))
    return NextResponse.json({ error: "no_passkey" }, { status: 400 });

  const options = await buildAuthenticationOptions(m.userId);
  const jar = await cookies();
  jar.set(WEBAUTHN_AUTH_COOKIE, options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
  return NextResponse.json(options);
}
