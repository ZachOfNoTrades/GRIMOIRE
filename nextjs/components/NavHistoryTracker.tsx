"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { recordVisit } from "@/lib/navHistory";

// Records each visited route into a session-scoped stack so useGoBack can tell
// whether the previous page is in the same module (pop browser history) or not
// (fall back to the module's landing page). Renders nothing; mounted once in the
// root layout, running on every client navigation via usePathname.
export default function NavHistoryTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) recordVisit(pathname);
  }, [pathname]);

  return null;
}
