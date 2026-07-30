import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

  // Default request-body cap is 10MB; the rune rich-text card editor lets users
  // paste/attach an image or short video straight in, and both can exceed that —
  // without this, the request body silently truncates mid-multipart-boundary
  // and `request.formData()` throws instead of hitting the route's own
  // (smaller, friendlier) per-kind size check. Must sit above
  // MAX_VIDEO_UPLOAD_BYTES (50MB) plus multipart overhead.
  experimental: {
    middlewareClientMaxBodySize: "55mb",
  },
};

export default nextConfig;
