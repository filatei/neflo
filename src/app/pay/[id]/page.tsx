import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CheckoutClient } from "@/components/CheckoutClient";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const charge = await prisma.charge.findUnique({
    where: { id },
    include: { merchant: { select: { name: true } } },
  });
  if (!charge) notFound();

  const expired = !!charge.expiresAt && charge.expiresAt < new Date();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-8">
      <div className="mb-5 text-center">
        <span className="text-xl font-extrabold tracking-tight">Neflo</span>
      </div>
      <CheckoutClient
        id={charge.id}
        merchantName={charge.merchant.name}
        amountUsd={Number(charge.amountUsd)}
        description={charge.description}
        initialStatus={expired ? "EXPIRED" : charge.status}
        successUrl={charge.successUrl}
      />
      <p className="mt-6 text-center text-xs font-medium text-ink-400">
        Secured by Neflo · payments.torama.money
      </p>
    </main>
  );
}
