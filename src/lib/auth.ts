import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

function getAdapter() {
  if (IS_DEMO) return undefined;
  try {
    // Dynamic import to avoid crashing if DB is not configured
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { db } = require("@/lib/db");
    return PrismaAdapter(db);
  } catch (e) {
    console.error("[AUTH] Failed to initialize PrismaAdapter:", e);
    return undefined;
  }
}

const adapter = getAdapter();
// If adapter failed in production, fall back to JWT
const useJwt = IS_DEMO || !adapter;

const providers = IS_DEMO
  ? [
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
    ]
  : [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      }),
    ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...(adapter ? { adapter } : {}),

  session: { strategy: useJwt ? "jwt" : "database" },

  providers,

  trustHost: true,

  pages: {
    signIn: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }
      return token;
    },
    async session({ session, token, user }) {
      if (token && session.user) {
        // JWT mode
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.image = token.picture as string;
      } else if (user && session.user) {
        // Database mode
        session.user.id = user.id;
      }
      return session;
    },
  },
});
