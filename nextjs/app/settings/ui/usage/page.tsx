import { headers } from "next/headers";
import { getAuthorizedUser } from "@/lib/permissions";
import { getUsageReport, type UsageReport } from "@/lib/llm/usage";
import UsageClient from "./UsageClient";

// Preload the signed-in user's 30-day usage report, to avoid the page painting and then filling in
export default async function UsagePage() {
  let initialReport: UsageReport | null = null;
  try {
    const hdrs = await headers();
    const auth = await getAuthorizedUser(new Request("http://internal", { headers: hdrs }));
    // NOTE: A hot-reload worker can run without the injected SQL settings, and the client then fetches the report
    if (auth?.user.id && process.env.SQL_SERVER_URL) initialReport = await getUsageReport(auth.user.id, "30d");
  } catch (error) {
    console.warn("[usage] preload failed, client will fetch:", error instanceof Error ? error.message : error);
  }
  return <UsageClient initialReport={initialReport} />;
}
