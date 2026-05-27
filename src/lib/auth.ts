import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

const secret =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development" ? "dev-secret-not-for-production" : undefined);

const demoProviders = [
  Credentials({
    id: "demo",
    name: "Demo",
    credentials: {},
    async authorize() {
      return {
        id: DEMO_USER.id,
        name: DEMO_USER.name,
        email: DEMO_USER.email,
        image: DEMO_USER.image,
      };
    },
  }),
];

const productionProviders = [
  Google({
    clientId: process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "",
  }),
  Credentials({
    id: "credentials",
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      try {
        const email = credentials?.email as string;
        const password = credentials?.password as string;

        if (!email || !password) return null;

        const { db } = await import("@/lib/db");
        const bcrypt = await import("bcryptjs");
        const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
        await ensureAdminSchema();

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        // Block unverified email accounts
        if (!user.emailVerified) return null;

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      } catch (e) {
        console.error("[AUTH] Credentials authorize error:", e);
        return null;
      }
    },
  }),
];

const providers = IS_DEMO ? demoProviders : productionProviders;

// Shared cookie config — lets the session work across www and admin subdomains.
// Set COOKIE_DOMAIN to ".sophia.app" (with leading dot) in Vercel to enable.
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const useSecureCookies = process.env.NODE_ENV === "production";
const sessionCookieName = useSecureCookies
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,

  session: { strategy: "jwt" },

  providers,

  trustHost: true,

  cookies: cookieDomain
    ? {
        sessionToken: {
          name: sessionCookieName,
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: useSecureCookies,
            domain: cookieDomain,
          },
        },
      }
    : undefined,

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      // On first Google sign-in, ensure user exists in our DB
      if (account?.provider === "google" && user?.email) {
        try {
          const { db } = await import("@/lib/db");
          const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
          await ensureAdminSchema();
          const existing = await db.user.findUnique({
            where: { email: user.email },
          });
          if (existing) {
            token.id = existing.id;
            token.role = existing.role;
          } else {
            // Auto-grant admin if email is in ADMIN_EMAILS env var
            const adminEmails = (process.env.ADMIN_EMAILS || "")
              .split(",")
              .map((e) => e.trim().toLowerCase())
              .filter(Boolean);
            const role = adminEmails.includes(user.email.toLowerCase()) ? "admin" : "user";
            const created = await db.user.create({
              data: {
                email: user.email,
                name: user.name,
                image: user.image,
                role,
              },
            });
            token.id = created.id;
            token.role = created.role;
          }
        } catch (e) {
          console.error("[AUTH] DB sync failed:", e);
        }
      }
      // On credentials sign-in, ensure token has the DB user id + role
      if (account?.provider === "credentials" && user?.id) {
        token.id = user.id;
        try {
          const { db } = await import("@/lib/db");
          const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: { role: true },
          });
          token.role = dbUser?.role || "user";
        } catch {
          token.role = "user";
        }
      }
      // Demo mode — always user role
      if (account?.provider === "demo") {
        token.role = "user";
      }
      // Auto-promote based on ADMIN_EMAILS env if current token doesn't reflect it
      if (token.email && token.role !== "admin") {
        const adminEmails = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean);
        if (adminEmails.includes((token.email as string).toLowerCase())) {
          try {
            const { db } = await import("@/lib/db");
            await db.user.update({
              where: { email: token.email as string },
              data: { role: "admin" },
            });
            token.role = "admin";
          } catch {
            // ignore — best effort
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.image = token.picture as string;
        // @ts-expect-error — extending Session.user with role
        session.user.role = (token.role as string) || "user";
      }
      return session;
    },
  },
});
