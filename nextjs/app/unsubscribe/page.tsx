import { KIND_LABELS, verifyUnsubscribeToken } from "@/lib/emailUnsubscribe";
import UnsubscribeClient from "./UnsubscribeClient";

// Public confirmation page for the unsubscribe link in every notification email. middleware.ts
// excludes this path from the NextAuth gate on purpose — a recipient must be able to unsubscribe
// without signing in. The token is verified here (server side) purely to decide what to show;
// nothing is written until the visitor actually clicks, so a mail scanner prefetching the link
// can't unsubscribe anyone.

interface UnsubscribePageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function UnsubscribePage({ searchParams }: UnsubscribePageProps) {
  const { token } = await searchParams;
  const verified = token ? verifyUnsubscribeToken(token) : null;

  return (
    /* PAGE SHELL */
    <div className="page-container">
      {/* UNSUBSCRIBE CARD */}
      <div className="card max-w-xl mx-auto mt-8">
        {/* CARD HEADER */}
        <div className="card-header">
          <h1 className="text-card-title">Grimoire email notifications</h1>
        </div>

        {/* CARD CONTENT */}
        <div className="card-content">
          {verified && token ? (
            <UnsubscribeClient
              token={token}
              label={KIND_LABELS[verified.kind]}
              isAll={verified.kind === "all"}
            />
          ) : (
            /* INVALID TOKEN STATE */
            <div className="alert-red">
              <p className="alert-title">This unsubscribe link isn&apos;t valid</p>
              <p className="alert-text">
                The link may have been truncated by your mail client. You can turn any notification
                off directly from that module&apos;s settings page in Grimoire.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
