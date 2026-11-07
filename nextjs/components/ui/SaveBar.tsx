"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaveBarProps {
  onSave: () => void;
  isSaveDisabled: boolean;
  isSaving: boolean;
}

// Pin a page's Save to a bar at the bottom of a `.page-with-bottom-bar` page
export function SaveBar({ onSave, isSaveDisabled, isSaving }: SaveBarProps) {
  return (

    // BOTTOM ACTION BAR
    <div className="bottom-action-bar">

      {/* ACTION ROW */}
      <div className="bottom-action-row">

        {/* SAVE BUTTON */}
        <Button className="btn-blue bottom-action-save" onClick={onSave} disabled={isSaveDisabled || isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
