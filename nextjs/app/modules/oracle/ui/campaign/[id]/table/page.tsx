// The four campaign tabs share one page now. This address is kept so older links and bookmarks
// still work, and sends the browser to that page with this tab open.
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OracleTablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/modules/oracle/ui/campaign/${id}?tab=table`);
}
