/**
 * Build identity — the values behind the nav-drawer release tag.
 *
 * The raw strings are baked in at build/dev-server start by `next.config.ts`
 * (which reads git). They're exposed through `env` there rather than read here
 * at runtime, so this module works unchanged in client components: Next inlines
 * the literals into the browser bundle.
 */

// Build number = the date the running code is from, `YYYY.MM.DD` (HEAD's commit
// date on a clean tree, otherwise the date the server started — see
// next.config.ts). Self-bumping, strictly increasing, directly comparable, and
// it answers the question actually asked of a build tag: how old is this?
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD || "unknown";

// Release channel — what the tag promises about this build. Set in
// next.config.ts, overridable per-deploy via NEXT_PUBLIC_APP_CHANNEL.
export const APP_CHANNEL = process.env.NEXT_PUBLIC_APP_CHANNEL || "dev";

// Short commit sha of the running tree, "-dirty" when there are uncommitted
// changes. Pins the exact code behind a build number.
export const APP_COMMIT = process.env.NEXT_PUBLIC_APP_COMMIT || "";

// "2026.08.03 · 7f57bd3" — what the drawer footer and its tooltip show. The
// literal "build " prefix the number used to carry is gone: a date reads as a
// build stamp on its own, and the drawer only affords ~173px for this line, so
// keeping the word ellipsised away the "-dirty" marker on the sha instead.
export const APP_BUILD_DETAIL = APP_COMMIT ? `${APP_BUILD} · ${APP_COMMIT}` : APP_BUILD;
