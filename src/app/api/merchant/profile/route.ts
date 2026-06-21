import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";

const str = (max: number) => z.string().max(max).optional().or(z.literal(""));

const schema = z
  .object({
    applicantType: z.enum(["BUSINESS", "INDIVIDUAL"]).default("BUSINESS"),
    // Business
    legalName: str(120),
    registrationType: z.enum(["RC", "BN"]).optional().or(z.literal("")),
    registrationNumber: str(40),
    businessType: str(60),
    // Individual
    fullName: str(120),
    nin: str(11),
    // Shared
    phone: str(30),
    website: z.string().url().max(200).optional().or(z.literal("")),
    address: str(200),
    settlementBankCode: str(10),
    settlementAccountNumber: str(10),
    settlementAccountName: str(120),
  })
  .superRefine((d, ctx) => {
    if (d.applicantType === "INDIVIDUAL") {
      if (!d.fullName || d.fullName.trim().length < 2) {
        ctx.addIssue({ code: "custom", path: ["fullName"], message: "Enter your full name." });
      }
      if (!d.nin || !/^\d{11}$/.test(d.nin)) {
        ctx.addIssue({ code: "custom", path: ["nin"], message: "Enter your 11-digit NIN." });
      }
    } else if (!d.legalName || d.legalName.trim().length < 2) {
      ctx.addIssue({ code: "custom", path: ["legalName"], message: "Enter your legal business name." });
    }
  });

// Save the KYB/business profile and mark it submitted for review.
export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // Surface the first human message rather than a raw zod blob.
    const first = parsed.error.issues[0]?.message ?? "Please check the form and try again.";
    return NextResponse.json({ error: first }, { status: 400 });
  }
  const d = parsed.data;
  const individual = d.applicantType === "INDIVIDUAL";
  const displayName = (individual ? d.fullName : d.legalName) || merchant.name;
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      applicantType: d.applicantType,
      name: displayName,
      legalName: individual ? null : d.legalName || null,
      registrationType: individual ? null : d.registrationType || null,
      registrationNumber: individual ? null : d.registrationNumber || null,
      businessType: individual ? null : d.businessType || null,
      fullName: individual ? d.fullName || null : null,
      nin: individual ? d.nin || null : null,
      phone: d.phone || null,
      website: d.website || null,
      address: d.address || null,
      settlementBankCode: d.settlementBankCode || null,
      settlementAccountNumber: d.settlementAccountNumber || null,
      settlementAccountName: d.settlementAccountName || null,
      kybSubmittedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, status: "submitted" });
}
