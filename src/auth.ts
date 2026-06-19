import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { sendMagicLinkEmail } from "@/lib/mailer";

/**
 * Auth.js v5 config — Google sign-in, mirroring Otuburu's flow.
 * Sessions are JWT-based for speed on low-bandwidth networks (no per-request DB hit).
 * The Prisma adapter still persists users/accounts for the merchant model.
 */
const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Read the secret under either env name (v5 prefers AUTH_SECRET).
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { prompt: "select_account" },
      },
    }),
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: (process.env.SMTP_SECURE ?? "true") === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      },
      from: process.env.SMTP_FROM,
      // Brand the email with our monochrome shell via the shared mailer.
      sendVerificationRequest: async ({ identifier, url }) => {
        await sendMagicLinkEmail(identifier, url);
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Public platform: any Google account may sign up as a merchant.
      // Optional private-beta gate: if SIGNUP_ALLOWLIST is set, restrict to it.
      const allow = (process.env.SIGNUP_ALLOWLIST ?? "")
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (allow.length === 0) return true;
      return !!user.email && allow.includes(user.email.toLowerCase());
    },
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email;
        token.isAdmin = adminEmails.includes(user.email.toLowerCase());
      }
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? session.user.id;
        session.user.isAdmin = Boolean(token.isAdmin);
      }
      return session;
    },
  },
});
