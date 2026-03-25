import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

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
      // On initial sign-in, populate token from Google profile
      if (account && profile) {
        token.email = profile.email ?? "";
        token.name = profile.name ?? "";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.email = token.email ?? "";
      session.user.name = token.name ?? "";
      return session;
    },
  },
};
