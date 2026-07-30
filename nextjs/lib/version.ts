/**
 * Build identity — the values behind the nav-drawer release tag.
 *
 * The raw strings are baked in at build/dev-server start by `next.config.ts`
 * (which reads git). They're exposed through `env` there rather than read here
 * at runtime, so this module works unchanged in client components: Next inlines
 * the literals into the browser bundle.
 */

// Build number = commits on the branch. Self-bumping, strictly increasing, and
// directly comparable — a hand-maintained semver stops being either of those
// once the app revs on every requested change.
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD || "0";

// Release channel — what the tag promises about this build. Set in
// next.config.ts, overridable per-deploy via NEXT_PUBLIC_APP_CHANNEL.
export const APP_CHANNEL = process.env.NEXT_PUBLIC_APP_CHANNEL || "dev";

// Short commit sha of the running tree, "-dirty" when there are uncommitted
// changes. Pins the exact code behind a build number.
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT || "";

// "build 211 · 7f57bd3" — what the drawer footer and its tooltip show.
export const APP_BUILD_DETAIL = APP_COMMIT
  ? `build ${APP_BUILD} · ${APP_COMMIT}`
  : `build ${APP_BUILD}`;
