import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Verifies the current session exists and the user is authorized.
// Returns the session or null if unauthorized.
export async function getAuthorizedSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return null;
  }
  return session;
}

// Checks if the current session user has admin privileges.
// Returns true if user is a global admin, false otherwise.
export async function isAdmin(): Promise<boolean> {
  const session = await getAuthorizedSession();
  if (!session) {
    return false;
  }
  return session.user.globalAdmin;
}
