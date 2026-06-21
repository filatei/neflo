import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { getCurrentMerchant } from "@/lib/merchant";

// Local-disk storage for the optional business-registration certificate. The
// uploads dir is a host bind-mount (see docker-compose: /opt/neflo/uploads),
// so files survive container rebuilds. Files are private — only served back to
// the owning merchant.
export const runtime = "nodejs";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export async function POST(req: Request) {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("certificate");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a certificate file to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large — max 5 MB." }, { status: 400 });
  }
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Upload a PDF, JPG or PNG." }, { status: 400 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const filename = `cert-${merchant.id}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes);
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { certificatePath: filename },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const merchant = await getCurrentMerchant();
  if (!merchant) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const m = await prisma.merchant.findUnique({
    where: { id: merchant.id },
    select: { certificatePath: true },
  });
  if (!m?.certificatePath) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const safe = path.basename(m.certificatePath); // guard against path traversal
  const data = await fs.readFile(path.join(UPLOAD_DIR, safe)).catch(() => null);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const ext = safe.split(".").pop();
  const type =
    ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(data), {
    headers: { "Content-Type": type, "Content-Disposition": `inline; filename="${safe}"` },
  });
}
