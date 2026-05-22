import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";

// Return the session for JWT or API connections, return null on unauthorized
export async function getAuthorizedConnection() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session;

  const apiKeySession = await resolveApiKey(); // Check DB for key validity
  if (apiKeySession) return apiKeySession;

  return null;
}


// Return the session for JWT connections only, returns null on unauthorized
// No API connections allowed
export async function getAuthorizedSession() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session;
  return null;
}

// Checks if the current session user has admin privileges.
// Returns true if user is a global admin, false otherwise.
export async function isAdmin(): Promise<boolean> {
  const session = await getAuthorizedConnection();
  if (!session) {
    return false;
  }
  return session.user.globalAdmin;
}
