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
      name: { label: "Name", type: "text" },
      action: { label: "Action", type: "text" },
    },
    async authorize(credentials) {
      const email = credentials?.email as string;
      const password = credentials?.password as string;
      const name = credentials?.name as string | undefined;
      const action = credentials?.action as string | undefined;

      if (!email || !password) return null;

      const { db } = await import("@/lib/db");
      const bcrypt = await import("bcryptjs");

      if (action === "register") {
        // Registration
        const existing = await db.user.findUnique({ where: { email } });
        if (existing) {
          throw new Error("Ya existe una cuenta con este correo electronico");
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await db.user.create({
          data: {
            email,
            name: name || email.split("@")[0],
            passwordHash,
          },
        });

        return { id: user.id, name: user.name, email: user.email, image: user.image };
      }

      // Login
      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) {
        throw new Error("Credenciales invalidas");
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        throw new Error("Credenciales invalidas");
      }

      return { id: user.id, name: user.name, email: user.email, image: user.image };
    },
  }),
];

const providers = IS_DEMO ? demoProviders : productionProviders;

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret,

  session: { strategy: "jwt" },

  providers,

  trustHost: true,

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
          const existing = await db.user.findUnique({
            where: { email: user.email },
          });
          if (existing) {
            token.id = existing.id;
          } else {
            const created = await db.user.create({
              data: {
                email: user.email,
                name: user.name,
                image: user.image,
              },
            });
            token.id = created.id;
          }
        } catch (e) {
          console.error("[AUTH] DB sync failed:", e);
        }
      }
      // On credentials sign-in, ensure token has the DB user id
      if (account?.provider === "credentials" && user?.id) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.image = token.picture as string;
      }
      return session;
    },
  },
});
