"use client";

import { useAppHeight } from "@/lib/useAppHeight";

/* Mounts once for the whole forage module (from layout.tsx) and pins
   --app-height to the real visible viewport, so EVERY forage page — including
   the plain `.page` screens (recipes, library, settings sub-pages) — fills the
   painted area with no Firefox-Android dead band. Renders nothing, so it adds no
   DOM node and never disturbs the `body:has(...) > direct-child` shell selectors.
   See lib/useAppHeight for the rationale. */

export default function ForageViewportSync() {
  useAppHeight();
  return null;
}
