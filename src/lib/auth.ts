import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

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
  // In demo mode: no DB adapter, pure JWT sessions
  ...(IS_DEMO ? {} : { adapter: PrismaAdapter(db) }),

  session: { strategy: IS_DEMO ? "jwt" : "database" },

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
        // JWT mode (demo)
        session.user.id = token.id as string;
        session.user.name = token.name as string;
        session.user.email = token.email as string;
        session.user.image = token.picture as string;
      } else if (user && session.user) {
        // Database mode (production)
        session.user.id = user.id;
      }
      return session;
    },
  },
});
