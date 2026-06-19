import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AdminClient } from "@/components/AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect("/dashboard");

  const merchants = await prisma.merchant.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: { members: { include: { user: true }, take: 1 } },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Merchants</h1>
        <p className="text-sm font-medium text-ink-500">
          Review and approve merchant verification.
        </p>
      </div>
      <AdminClient
        merchants={merchants.map((m) => ({
          id: m.id,
          name: m.legalName ?? m.name,
          email: m.members[0]?.user.email ?? "—",
          status: m.status,
          registrationNumber: m.registrationNumber,
          settlementAccountName: m.settlementAccountName,
          submitted: !!m.kybSubmittedAt,
        }))}
      />
    </div>
  );
}
