import { APP_BUILD_DETAIL, APP_CHANNEL } from "@/lib/version";

/**
 * Build identity tag for the nav-drawer footer — channel pill + build number.
 * Lives in the drawer rather than the navbar so it never competes with the
 * wordmark or crowds the navbar row on a phone.
 */
export default function VersionBadge() {
  return (
    // VERSION LINE
    <div className="version-line" title={`${APP_CHANNEL} ${APP_BUILD_DETAIL}`}>

      {/* CHANNEL PILL */}
      <span className="version-chip">{APP_CHANNEL}</span>

      {/* BUILD NUMBER + COMMIT */}
      <span className="version-line-build">{APP_BUILD_DETAIL}</span>
    </div>
  );
}
