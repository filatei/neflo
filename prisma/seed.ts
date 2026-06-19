/**
 * Optional seed for local development. Creates a demo merchant so the
 * dashboard renders without a live Google sign-in.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@torama.money";
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Demo Platform" },
  });

  const existing = await prisma.merchantMember.findFirst({
    where: { userId: user.id },
  });
  if (!existing) {
    await prisma.merchant.create({
      data: {
        name: "Demo Platform",
        status: "ACTIVE",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
  }
  console.log("Seeded demo merchant for", email);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
