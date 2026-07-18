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
        const email = (credentials?.email as string)?.trim().toLowerCase();
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

        // Block banned accounts
        if (user.banned) return null;

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
    // Runs before jwt on every sign-in. Blocks banned accounts for all
    // providers (Google, credentials). Credentials also checks in authorize().
    async signIn({ user }) {
      if (IS_DEMO) return true;
      const email = user?.email?.trim().toLowerCase();
      if (!email) return true;
      try {
        const { db } = await import("@/lib/db");
        const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
        await ensureAdminSchema();
        const dbUser = await db.user.findUnique({
          where: { email },
          select: { banned: true },
        });
        if (dbUser?.banned) return false;
      } catch {
        // Best effort — if the check fails, don't lock everyone out.
      }
      return true;
    },
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
          const googleEmail = user.email.trim().toLowerCase();
          const { db } = await import("@/lib/db");
          const { ensureAdminSchema } = await import("@/lib/ensure-admin-schema");
          await ensureAdminSchema();
          const existing = await db.user.findUnique({
            where: { email: googleEmail },
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
            const role = adminEmails.includes(googleEmail) ? "admin" : "user";
            const created = await db.user.create({
              data: {
                email: googleEmail,
                name: user.name,
                image: user.image,
                role,
              },
            });
            token.id = created.id;
            token.role = created.role;

            // Start the 7-day free trial for brand-new Google accounts.
            try {
              const { TRIAL_DAYS } = await import("@/lib/plan");
              const now = new Date();
              await db.subscription.create({
                data: {
                  userId: created.id,
                  status: "trialing",
                  planId: "pro",
                  currentPeriodStart: now,
                  currentPeriodEnd: new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
                },
              });
            } catch (subErr) {
              console.error("[AUTH] trial subscription create failed:", subErr);
            }
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
      // Self-heal stale sessions: with JWT strategy the user id is baked into
      // the cookie at sign-in. If the DB was reset or the account recreated,
      // that id no longer exists and every FK insert (chats, properties,
      // generations) blows up. Re-verify the id at most every 5 minutes:
      // re-resolve by email when possible, kill the session when the account
      // is gone entirely.
      if (!IS_DEMO && !account && token.id && token.email) {
        const checkedAt = (token.dbCheckedAt as number) || 0;
        if (Date.now() - checkedAt > 5 * 60 * 1000) {
          try {
            const { db } = await import("@/lib/db");
            const byId = await db.user.findUnique({
              where: { id: token.id as string },
              select: { id: true, role: true, banned: true },
            });
            if (byId) {
              // Banned mid-session — revoke within one recheck window.
              if (byId.banned) return null;
              token.role = byId.role;
            } else {
              const byEmail = await db.user.findUnique({
                where: { email: (token.email as string).trim().toLowerCase() },
                select: { id: true, role: true, banned: true },
              });
              if (byEmail) {
                if (byEmail.banned) return null;
                token.id = byEmail.id;
                token.role = byEmail.role;
              } else {
                // Account no longer exists — invalidate the session.
                return null;
              }
            }
            token.dbCheckedAt = Date.now();
          } catch {
            // DB unavailable — keep the token; API routes degrade on their own
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
