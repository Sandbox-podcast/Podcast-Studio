import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isEmailAllowed, resolveMockRole, type SpikeMockRole } from "@/lib/spike-auth";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      const email = profile?.email;
      if (!email) {
        return false;
      }
      return isEmailAllowed(email);
    },
    jwt({ token, profile }) {
      const email = profile?.email ?? token.email;
      if (typeof email === "string") {
        token.mockRole = resolveMockRole(email);
      } else if (token.mockRole !== "host" && token.mockRole !== "guest") {
        token.mockRole = resolveMockRole("");
      }
      return token;
    },
    session({ session, token }) {
      const mockRole = token.mockRole;
      if (mockRole === "host" || mockRole === "guest") {
        session.mockRole = mockRole;
      } else {
        session.mockRole = "host" satisfies SpikeMockRole;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
