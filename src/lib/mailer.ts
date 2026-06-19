import nodemailer from "nodemailer";

/**
 * Email via the same Google SMTP relay Otuburu uses.
 * Configure SMTP_* env vars (smtp.gmail.com:465, app password).
 * From address is a @torama.money identity.
 */
let cached: nodemailer.Transporter | null = null;

function transport() {
  if (cached) return cached;
  // Google Workspace SMTP relay authenticates by server IP, so we only send
  // credentials if a password is actually configured. Without SMTP_PASS the
  // relay is used purely on IP trust (smtp-relay.gmail.com:587, STARTTLS).
  const auth =
    process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp-relay.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: (process.env.SMTP_SECURE ?? "false") === "true",
    ...(auth ? { auth } : {}),
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
  if (!process.env.SMTP_HOST) {
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

/** Passwordless sign-in link email. */
export async function sendMagicLinkEmail(to: string, url: string) {
  const body = `Click the button below to sign in to Neflo. This link expires
    shortly and can only be used once.<br><br>
    <a href="${url}" style="display:inline-block;background:#000;color:#fff;
      text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;
      border-radius:12px">Sign in to Neflo</a><br><br>
    <span style="font-size:12px;color:#8f8f8f">If the button doesn't work, paste
    this URL into your browser:<br>${url}</span><br><br>
    <span style="font-size:12px;color:#8f8f8f">If you didn't request this, you can
    safely ignore this email.</span>`;
  return sendMail({
    to,
    subject: "Your Neflo sign-in link",
    html: emailShell("Sign in to Neflo", body),
  });
}

/** Invite a teammate to a merchant. */
export async function sendInviteEmail(
  to: string,
  url: string,
  merchantName: string,
  role: string,
) {
  const body = `You've been invited to join <b>${merchantName}</b> on Neflo as
    <b>${role.toLowerCase()}</b>.<br><br>
    <a href="${url}" style="display:inline-block;background:#000;color:#fff;
      text-decoration:none;font-weight:700;font-size:14px;padding:12px 20px;
      border-radius:12px">Accept invitation</a><br><br>
    <span style="font-size:12px;color:#8f8f8f">Or paste this link: ${url}</span>`;
  return sendMail({
    to,
    subject: `You're invited to ${merchantName} on Neflo`,
    html: emailShell("Team invitation", body),
  });
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
