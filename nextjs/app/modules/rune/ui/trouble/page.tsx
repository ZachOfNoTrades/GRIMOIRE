import { headers } from "next/headers";
import { getAuthorizedUser } from "@/lib/permissions";
import { getTroubleCards } from "../../lib/troubleFunctions";
import { TroubleCard } from "../../types/trouble";
import TroubleClient from "./TroubleClient";

// Per-user data read from the request: never prerender this page at build time.
export const dynamic = "force-dynamic";

// Load the trouble list on the server, leaving it null when the load fails or is skipped
export default async function RuneTroublePage() {
  let initialCards: TroubleCard[] | null = null;
  try {
    const auth = await getAuthorizedUser(new Request("http://internal", { headers: await headers() }));
    if (auth?.user.id && process.env.SQL_SERVER_URL) { // Skip without SQL env to avoid poisoning the pool on a hot-reload worker
      initialCards = await getTroubleCards({ id: auth.user.id, email: auth.user.email });
    }
  } catch (error) {
    console.error("Trouble page preload failed:", error);
  }

  return <TroubleClient initialCards={initialCards} />;
}
