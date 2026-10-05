import { Eye, EyeOff, Scan } from "lucide-react";
import type { ReactNode } from "react";

// One icon per level, used by the details pane's dropdown and the map's right-click menu so the
// same state reads the same way in both.
export const VISIBILITY_ICONS: Record<string, ReactNode> = {
  hidden: <EyeOff className="w-4 h-4" aria-hidden />,
  sight: <Scan className="w-4 h-4" aria-hidden />,
  revealed: <Eye className="w-4 h-4" aria-hidden />,
};
