import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.merchantInvite.findUnique({
    where: { token },
    include: { merchant: true },
  });

  const session = await auth();

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <div className="card text-center">
        <div className="flex justify-center">
          <Logo size={24} />
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );

  if (!invite || invite.acceptedAt) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">Invitation unavailable</h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          This invite is invalid or has already been used.
        </p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">
          Join {invite.merchant.name}
        </h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          Sign in as {invite.email} to accept this invitation.
        </p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: `/invite/${token}` });
          }}
        >
          <button className="btn-primary w-full">Continue with Google</button>
        </form>
      </Shell>
    );
  }

  if (session.user?.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold tracking-tight">Wrong account</h1>
        <p className="mt-1 text-sm font-medium text-ink-500">
          This invite is for {invite.email}, but you&apos;re signed in as{" "}
          {session.user?.email}. Sign out and use the invited address.
        </p>
      </Shell>
    );
  }

  async function accept() {
    "use server";
    if (!invite || !session?.user?.id) return;
    await prisma.$transaction(async (tx) => {
      await tx.merchantMember.upsert({
        where: {
          merchantId_userId: {
            merchantId: invite.merchantId,
            userId: session.user.id,
          },
        },
        create: {
          merchantId: invite.merchantId,
          userId: session.user.id,
          role: invite.role,
        },
        update: { role: invite.role },
      });
      await tx.merchantInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
    });
    redirect("/dashboard");
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold tracking-tight">
        Join {invite.merchant.name}
      </h1>
      <p className="mt-1 text-sm font-medium text-ink-500">
        You&apos;ve been invited as {invite.role.toLowerCase()}.
      </p>
      <form className="mt-6" action={accept}>
        <button className="btn-primary w-full">Accept invitation</button>
      </form>
    </Shell>
  );
}
