import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

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
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/signin",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { prompt: "select_account" },
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // If an allowlist is configured, restrict sign-in to those addresses.
      if (adminEmails.length === 0) return true;
      return !!user.email && adminEmails.includes(user.email.toLowerCase());
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
