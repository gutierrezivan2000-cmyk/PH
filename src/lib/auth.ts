import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { DEMO_USER } from "@/lib/demo-store";

const IS_DEMO = process.env.DEMO_MODE === "true";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // In demo mode: no DB adapter, use JWT sessions
  ...(IS_DEMO
    ? { session: { strategy: "jwt" as const } }
    : { adapter: PrismaAdapter(db) }),

  providers: [
    // Demo credentials provider (only active in DEMO_MODE)
    ...(IS_DEMO
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
      : []),

    // Google OAuth (only when not in demo mode)
    ...(!IS_DEMO
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],

  pages: {
    signIn: "/login",
  },

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
