import { prisma } from "@/lib/db";
import { getCurrentMembership } from "@/lib/merchant";
import { TeamClient } from "@/components/TeamClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const m = await getCurrentMembership();
  if (!m) return null;

  const [members, invites] = await Promise.all([
    prisma.merchantMember.findMany({
      where: { merchantId: m.merchant.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.merchantInvite.findMany({
      where: { merchantId: m.merchant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-sm font-medium text-ink-500">
          Invite teammates and manage their access to {m.merchant.name}.
        </p>
      </div>
      <TeamClient
        myRole={m.role}
        members={members.map((x) => ({
          id: x.id,
          email: x.user.email,
          name: x.user.name,
          role: x.role,
          you: x.userId === m.userId,
        }))}
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
        }))}
      />
    </div>
  );
}
