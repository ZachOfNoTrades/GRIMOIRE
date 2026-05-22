import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resolveApiKey } from "@/lib/apiKeys";

// Verifies the current session exists and te user is authorized,
// or accepts an x-api-key header
export async function getAuthorizedConnection() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) return session;

  const apiKeySession = await resolveApiKey(); // Check DB for key validity
  if (apiKeySession) return apiKeySession;

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
