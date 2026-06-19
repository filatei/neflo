import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";

const schema = z.object({
  legalName: z.string().min(2).max(120),
  registrationNumber: z.string().max(40).optional(),
  businessType: z.string().max(60).optional(),
  phone: z.string().max(30).optional(),
  website: z.string().url().max(200).optional().or(z.literal("")),
  address: z.string().max(200).optional(),
  settlementBankCode: z.string().max(10).optional(),
  settlementAccountNumber: z.string().max(10).optional(),
  settlementAccountName: z.string().max(120).optional(),
});

// Save the KYB/business profile and mark it submitted for review.
export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const d = parsed.data;
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      legalName: d.legalName,
      name: d.legalName,
      registrationNumber: d.registrationNumber,
      businessType: d.businessType,
      phone: d.phone,
      website: d.website || null,
      address: d.address,
      settlementBankCode: d.settlementBankCode,
      settlementAccountNumber: d.settlementAccountNumber,
      settlementAccountName: d.settlementAccountName,
      kybSubmittedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, status: "submitted" });
}
