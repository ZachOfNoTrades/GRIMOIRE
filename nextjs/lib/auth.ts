import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getUserByEmail } from "@/lib/users";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // On initial sign-in, populate token email from Google profile
      if (account && profile) {
        token.email = profile.email ?? "";
      }

      // Look up user in database by email
      if (token.email) {
        try {
          const user = await getUserByEmail(token.email);
          if (user && user.enabled) {
            token.id = user.id;
            token.name = user.name ?? "";
            token.globalAdmin = !!user.global_admin;
          } else {
            token.id = null;
            token.globalAdmin = false;
          }
        } catch (error) {
          console.error("Error looking up user in JWT callback:", error);
          token.id = null;
          token.globalAdmin = false;
        }
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id ?? null;
      session.user.email = token.email ?? "";
      session.user.name = token.name ?? "";
      session.user.globalAdmin = token.globalAdmin ?? false;
      return session;
    },
  },
};
