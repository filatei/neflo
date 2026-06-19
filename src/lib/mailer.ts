import nodemailer from "nodemailer";

/**
 * Email via the same Google SMTP relay Otuburu uses.
 * Configure SMTP_* env vars (smtp.gmail.com:465, app password).
 * From address is a @torama.money identity.
 */
let cached: nodemailer.Transporter | null = null;

function transport() {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cached;
}

const FROM = process.env.SMTP_FROM ?? "Neflo <no-reply@torama.money>";

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  if (!process.env.SMTP_USER) {
    // In dev without SMTP configured, log instead of throwing.
    console.warn("[mailer] SMTP not configured — skipping email to", opts.to);
    return { skipped: true };
  }
  await transport().sendMail({ from: FROM, ...opts });
  return { skipped: false };
}

/** Minimal monochrome email shell — matches the app's no-color aesthetic. */
export function emailShell(title: string, body: string) {
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Inter,Arial,sans-serif;color:#0d0d0d">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">
      <tr><td style="font-weight:800;font-size:20px;letter-spacing:-0.02em">Neflo</td></tr>
      <tr><td style="padding-top:20px;font-weight:700;font-size:18px">${title}</td></tr>
      <tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#2b2b2b">${body}</td></tr>
      <tr><td style="padding-top:28px;font-size:12px;color:#8f8f8f">Neflo · payments.torama.money</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** Notify a merchant that a stablecoin deposit was credited. */
export async function sendDepositCreditedEmail(params: {
  to: string;
  asset: string;
  usdAmount: string;
  localCcy: string;
  localAmount: string;
  txHash: string;
}) {
  const body = `A stablecoin deposit has been credited to your Neflo balance.<br><br>
    <b>${params.usdAmount} ${params.asset}</b> received → credited
    <b>${params.localAmount} ${params.localCcy}</b>.<br><br>
    Transaction: <span style="font-family:monospace;font-size:12px">${params.txHash}</span>`;
  return sendMail({
    to: params.to,
    subject: `Deposit credited — ${params.localAmount} ${params.localCcy}`,
    html: emailShell("Deposit credited", body),
  });
}
