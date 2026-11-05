import { headers } from "next/headers";
import { getAuthorizedUser } from "@/lib/permissions";
import { getUsageReport, type UsageReport } from "@/lib/llm/usage";
import { parseChartModules } from "@/lib/usageChartModules";
import UsageClient from "./UsageClient";

// Preload the signed-in user's 30-day usage report, to avoid the page painting and then filling in, and read the chart's module filter from ?modules=
export default async function UsagePage({ searchParams }: { searchParams: Promise<{ modules?: string | string[] }> }) {
  const initialChartModules = parseChartModules((await searchParams).modules);
  let initialReport: UsageReport | null = null;
  try {
    const hdrs = await headers();
    const auth = await getAuthorizedUser(new Request("http://internal", { headers: hdrs }));
    // NOTE: A hot-reload worker can run without the injected SQL settings, and the client then fetches the report
    if (auth?.user.id && process.env.SQL_SERVER_URL) initialReport = await getUsageReport(auth.user.id, "30d");
  } catch (error) {
    console.warn("[usage] preload failed, client will fetch:", error instanceof Error ? error.message : error);
  }

  // Key the page on ?modules=, to avoid keeping the chart filter of the previous address
  return <UsageClient key={initialChartModules.join(",")} initialReport={initialReport} initialChartModules={initialChartModules} />;
}
