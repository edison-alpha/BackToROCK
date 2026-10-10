import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// JWT sessions: no database, the session lives in a signed cookie.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
});
