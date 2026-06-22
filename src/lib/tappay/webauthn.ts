import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { prisma } from "@/lib/db";

/**
 * WebAuthn (passkey / fingerprint / Face ID) as a second way to authorise a
 * TapPay payment, alongside the transaction PIN. Uses @simplewebauthn/server.
 * The Relying Party is derived from NEXTAUTH_URL so it tracks the deployment.
 */

// httpOnly cookies that hold the one-time challenge between options + verify.
export const WEBAUTHN_REG_COOKIE = "tappay_wa_reg";
export const WEBAUTHN_AUTH_COOKIE = "tappay_wa_auth";

export function rpOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || process.env.NEXTAUTH_URL || "http://localhost:3000";
}
export function rpID(): string {
  try {
    return new URL(rpOrigin()).hostname;
  } catch {
    return "localhost";
  }
}
const RP_NAME = "Neflo";

export async function buildRegistrationOptions(userId: string, userName: string) {
  const existing = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID(),
    userID: new TextEncoder().encode(userId),
    userName,
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: splitTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred", // biometric / device PIN if available
    },
  });
}

export async function verifyRegistration(
  userId: string,
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rpOrigin(),
    expectedRPID: rpID(),
  });
  if (!verification.verified || !verification.registrationInfo) return false;

  const { credential } = verification.registrationInfo;
  await prisma.webAuthnCredential.upsert({
    where: { credentialId: credential.id },
    create: {
      userId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: response.response.transports?.join(",") ?? null,
    },
    update: { counter: BigInt(credential.counter) },
  });
  return true;
}

export async function buildAuthenticationOptions(userId: string) {
  const creds = await prisma.webAuthnCredential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });
  return generateAuthenticationOptions({
    rpID: rpID(),
    userVerification: "preferred",
    allowCredentials: creds.map((c) => ({
      id: c.credentialId,
      transports: splitTransports(c.transports),
    })),
  });
}

/** Verify an assertion for `userId`. Returns true on success and bumps counter. */
export async function verifyAuthentication(
  userId: string,
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
): Promise<boolean> {
  const cred = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: response.id },
  });
  if (!cred || cred.userId !== userId) return false;

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: rpOrigin(),
    expectedRPID: rpID(),
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKey),
      counter: Number(cred.counter),
      transports: splitTransports(cred.transports),
    },
  });
  if (!verification.verified) return false;

  await prisma.webAuthnCredential.update({
    where: { credentialId: cred.credentialId },
    data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return true;
}

export async function hasPasskeys(userId: string): Promise<boolean> {
  const n = await prisma.webAuthnCredential.count({ where: { userId } });
  return n > 0;
}

type Transport = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";
function splitTransports(s: string | null): Transport[] | undefined {
  if (!s) return undefined;
  return s.split(",").filter(Boolean) as Transport[];
}
