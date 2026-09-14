import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// BUILD IDENTITY — resolved once, when the dev server or build starts, and
// inlined into both bundles via `env` below (see lib/version.ts for the typed
// accessors). Every lookup is best-effort: a tarball export with no .git, or a
// detached HEAD, must not fail the build — it just yields a blank/"unknown"
// segment that the badge renders around.
function readGit(command: string): string {
  try {
    return execSync(command, { cwd: __dirname, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

// Release channel shown on the tag. Named here rather than derived from the git
// branch: the branch is a working name that gets renamed, while the channel is
// what the tag promises about the build. Override per-deploy with
// NEXT_PUBLIC_APP_CHANNEL.
const RELEASE_CHANNEL = "unstable";

const gitCommit = readGit("git rev-parse --short HEAD");
// A dirty working tree means the running code is NOT the commit sha alone, so
// mark it — otherwise the badge claims a precision it doesn't have on a dev box
// where everything is uncommitted.
const gitDirty = readGit("git status --porcelain") !== "";

// Build number = the date the running code is from, `YYYY.MM.DD`. It replaces
// the old commit-count number, which said nothing about freshness — the useful
// question about a build is "how old is this?", not "how many commits deep".
// Still strictly increasing and directly comparable, and unlike a
// hand-maintained semver it needs no bumping once the app revs on each
// requested change. package.json's `version` is deliberately NOT the displayed
// version; it stays put as npm metadata.
//
// Which date depends on whether the tree is clean:
//   clean  -> HEAD's commit date, so rebuilding an old commit reproduces its
//             build number instead of stamping it with today.
//   dirty  -> now, because the running code is newer than the last commit (the
//             normal state on this dev box, where nothing is committed) and
//             HEAD's date would report the app as stale for as long as work
//             stays uncommitted.
// Both are local dates — the badge is read by a human in this timezone, not
// diffed across regions. `format-local:` makes git honour that too; without it
// git formats in the commit's own recorded offset.
function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join(".");
}

const committedDate = gitDirty ? "" : readGit('git log -1 --format=%cd --date=format-local:%Y.%m.%d');
const buildNumber = committedDate || localDate(new Date());

const nextConfig: NextConfig = {
  // Exposed to the client (NEXT_PUBLIC_ prefix) so the nav-drawer footer can
  // render without a round trip. Explicit env vars still win, which is how a
  // deploy pins a channel name that isn't the one baked in here.
  env: {
    NEXT_PUBLIC_APP_BUILD: process.env.NEXT_PUBLIC_APP_BUILD || buildNumber,
    NEXT_PUBLIC_APP_CHANNEL: process.env.NEXT_PUBLIC_APP_CHANNEL || RELEASE_CHANNEL,
    NEXT_PUBLIC_APP_COMMIT:
      process.env.NEXT_PUBLIC_APP_COMMIT || (gitCommit ? `${gitCommit}${gitDirty ? "-dirty" : ""}` : ""),
  },

  // TypeScript IS type-checked at build time (the codebase is clean per
  // `tsc --noEmit`) — leave that gate on so real type errors fail the build.
  // ESLint is skipped only because this project has no ESLint config set up
  // (`next lint` prompts to initialise one); there's nothing to lint against,
  // and enabling it would stall the non-interactive build. Set up ESLint and
  // flip this off if/when lint coverage is wanted.
  eslint: { ignoreDuringBuilds: true },

  // mssql / tedious pull in Node builtins (crypto, os, tls, net, dns). Without this,
  // webpack tries to bundle them for the edge runtime via the instrumentation graph
  // and the production build fails. Keeping them as runtime requires is correct —
  // they're only called from Node server code.
  // puppeteer-core is loaded (dynamically) by the recipe web-import fallback to
  // drive headless Chromium; like the DB drivers it must stay a runtime require
  // rather than be bundled.
  serverExternalPackages: ["mssql", "tedious", "@infisical/sdk", "puppeteer-core"],

  // The `next dev` tools badge (the floating Next logo button) is fixed at
  // z-index 2147483647, so it lands on top of the app chrome — on a phone
  // viewport it sits directly over the header avatar and swallows the tap.
  // This box runs `next dev` as its canonical instance (see ~/.claude/CLAUDE.md),
  // so the badge is on screen during normal use, not just while debugging.
  // `false` is the supported way to turn it off in Next 15.3+; the old
  // buildActivity/appIsrStatus sub-options are deprecated.
  devIndicators: false,

  // Default request-body cap is 10MB; the rune rich-text card editor lets users
  // paste/attach an image or short video straight in, and both can exceed that —
  // without this, the request body silently truncates mid-multipart-boundary
  // and `request.formData()` throws instead of hitting the route's own
  // (smaller, friendlier) per-kind size check. Must sit above
  // MAX_VIDEO_UPLOAD_BYTES (50MB) plus multipart overhead.
  experimental: {
    middlewareClientMaxBodySize: "55mb",
  },

  // Damnation's guest pages moved from /play to /damnation so each public module has its own
  // namespace; links and QR codes from before the move still land on the right page.
  async redirects() {
    return [
      { source: "/play", destination: "/damnation", permanent: false },
      { source: "/play/:code", destination: "/damnation/:code", permanent: false },
    ];
  },
};

export default nextConfig;
