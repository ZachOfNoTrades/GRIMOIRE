"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SaveBarProps {
  onSave: () => void;
  isSaveDisabled: boolean;
  isSaving: boolean;
  onCancel?: () => void; // shows Cancel before Save, for a page that edits a record in place
}

// Pin a page's Save, and Cancel when given, to a bar at the bottom of a `.page-with-bottom-bar` page
export function SaveBar({ onSave, isSaveDisabled, isSaving, onCancel }: SaveBarProps) {
  return (

    // BOTTOM ACTION BAR
    <div className="bottom-action-bar">

      {/* ACTION ROW */}
      <div className="bottom-action-row">

        {/* CANCEL BUTTON */}
        {onCancel && (
          <Button className="btn-off" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}

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
