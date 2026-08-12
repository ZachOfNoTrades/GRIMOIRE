import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getUserByEmail } from "@/lib/users";
import { saveGoogleRefreshToken } from "@/lib/googleMail";

export const authOptions: NextAuthOptions = {
  providers: [
    // Deliberately NOT requesting gmail.send here. That's a sensitive scope, and asking for
    // it on every sign-in meant every fresh Google login — not just users of the Gmail-send
    // feature — had to pass Google's Testing/verification gate. Default scope (openid email
    // profile) is non-sensitive, so login stays frictionless for everyone. Gmail-send should
    // be requested as a separate incremental-auth step for users who opt into that delivery
    // method; until that's built, lib/googleMail.ts has no refresh tokens to work with.
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
            token.generationLimit = user.generation_limit ?? 1;

            // Keep the refresh token from this sign-in so the schedulers can send this user's
            // notification emails later, hours after the session that produced it. Google only
            // returns it on the consent exchange, so this is the one chance to store it — but a
            // storage failure must never cost the user their sign-in.
            if (account?.refresh_token) {
              try {
                await saveGoogleRefreshToken(
                  user.id,
                  account.refresh_token,
                  (account.scope as string | undefined) ?? null,
                );
              } catch (error) {
                console.error("Error storing Google refresh token:", error);
              }
            }
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
      session.user.generationLimit = token.generationLimit ?? 1;
      return session;
    },
  },
};
