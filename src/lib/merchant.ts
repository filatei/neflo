import { auth } from "@/auth";
import { prisma } from "./db";

/**
 * Resolve the signed-in user's primary merchant, creating a default one on
 * first sign-in so onboarding is zero-friction. Returns null if not signed in.
 */
export async function getCurrentMerchant() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const membership = await prisma.merchantMember.findFirst({
    where: { userId },
    include: { merchant: true },
    orderBy: { createdAt: "asc" },
  });
  if (membership) return membership.merchant;

  // Bootstrap a merchant for this user.
  const name = session.user?.name ?? session.user?.email ?? "My platform";
  const merchant = await prisma.merchant.create({
    data: {
      name: `${name}`,
      status: "ACTIVE",
      members: { create: { userId, role: "OWNER" } },
    },
  });
  return merchant;
}

export async function requireMerchant() {
  const merchant = await getCurrentMerchant();
  if (!merchant) throw new Error("UNAUTHENTICATED");
  return merchant;
}
