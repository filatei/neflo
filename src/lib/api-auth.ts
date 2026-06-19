import type { Merchant } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { hashApiKey } from "./apikey";

export type ApiAuth = {
  merchant: Merchant;
  keyId: string;
  mode: "TEST" | "LIVE";
};

/**
 * Authenticate a request by its API key. Accepts `Authorization: Bearer <key>`
 * or the raw key. Keys are matched by SHA-256 hash; lastUsedAt is bumped.
 */
export async function authenticateApiKey(req: Request): Promise<ApiAuth | null> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : header.trim();
  if (!key) return null;

  const apiKey = await prisma.apiKey.findFirst({
    where: { hash: hashApiKey(key), revokedAt: null },
  });
  if (!apiKey) return null;

  // Bump lastUsedAt without blocking the request.
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const merchant = await prisma.merchant.findUnique({
    where: { id: apiKey.merchantId },
  });
  if (!merchant) return null;

  return { merchant, keyId: apiKey.id, mode: apiKey.mode };
}

/** Standard 401 for missing/invalid keys. */
export function unauthorized() {
  return NextResponse.json(
    { error: "unauthorized", message: "Missing or invalid API key" },
    { status: 401 },
  );
}
