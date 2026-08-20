"use client";

import { useState } from "react";
import { Pencil, Link as LinkIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import Modal from "@/components/Modal";

// The three ways to start a recipe — mirrors MacroFactor's "How would you like
// to build your recipe?" step.
type BuildMethod = "scratch" | "url" | "ai";

const METHODS: { key: BuildMethod; Icon: typeof Pencil; label: string; desc: string }[] = [
  { key: "scratch", Icon: Pencil, label: "Build from scratch", desc: "Manually enter each ingredient" },
  { key: "url", Icon: LinkIcon, label: "Import from website", desc: "Pull a recipe from a link" },
  { key: "ai", Icon: Sparkles, label: "Import with AI", desc: "Identify ingredients from a photo" },
];

export default function RecipeBuildPicker({
  onClose,
  onScratch,
  onAi,
  onImportUrl,
  importing,
  busy = false,
  zIndex,
}: {
  onClose: () => void;
  onScratch: () => void;
  onAi: () => void;
  onImportUrl: (url: string) => void;
  importing: boolean;
  /* True while the chosen method's blank-recipe POST is in flight — keeps a
     double-tap on Next from creating two recipes. */
  busy?: boolean;
  /* Stacking order, for hosts that open the picker from inside another modal
     (the food logger) — without it the picker renders behind its opener. */
  zIndex?: number;
}) {
  // INPUT
  const [method, setMethod] = useState<BuildMethod>("scratch");
  const [url, setUrl] = useState("");

  // STATE — which step of the picker is showing ("method" choose, "link" paste URL)
  const [step, setStep] = useState<"method" | "link">("method");

  function handleNext() {
    if (method === "scratch") onScratch();
    else if (method === "ai") onAi();
    else setStep("link");
  }

  return (
    /* BUILD METHOD PICKER */
    <Modal
      isOpen={true}
      onClose={importing ? () => {} : onClose}
      disableClose={importing}
      zIndex={zIndex}
      title={step === "method" ? "Create Recipe" : "Import from website"}
      footer={
        step === "method" ? (
          /* NEXT */
          <Button className="btn-blue" onClick={handleNext} disabled={busy} style={{ width: "100%" }}>
            {busy ? "Creating…" : "Next"}
          </Button>
        ) : (
          /* IMPORT */
          <Button
            className="btn-blue"
            onClick={() => onImportUrl(url.trim())}
            disabled={importing || !url.trim()}
            style={{ width: "100%" }}
          >
            {importing ? "Importing…" : "Import"}
          </Button>
        )
      }
    >
      {step === "method" ? (
        /* METHOD CARDS */
        <div className="flex flex-col gap-2">
          {METHODS.map(({ key, Icon, label, desc }) => {
            const active = method === key;
            return (
              /* METHOD OPTION */
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                aria-pressed={active}
                className="sub-card"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.875rem",
                  textAlign: "left",
                  cursor: "pointer",
                  border: active ? "1px solid var(--btn-blue-hover)" : "1px solid var(--color-border)",
                }}
              >

                {/* ICON */}
                <Icon className="w-5 h-5" style={{ flexShrink: 0, color: active ? "var(--btn-blue-hover)" : "var(--color-gray)" }} />

                {/* LABEL + DESC */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-primary" style={{ fontWeight: 600, fontSize: "0.9375rem" }}>{label}</div>
                  <div className="text-muted" style={{ fontSize: "0.75rem" }}>{desc}</div>
                </div>

                {/* RADIO */}
                <span
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    width: "1.1rem",
                    height: "1.1rem",
                    borderRadius: "999px",
                    border: active ? "0.34rem solid var(--btn-blue-hover)" : "2px solid var(--color-gray)",
                    boxSizing: "border-box",
                  }}
                />
              </button>
            );
          })}
        </div>
      ) : (
        /* LINK STEP */
        <div className="flex flex-col gap-2">
          <label htmlFor="recipe-import-url" className="text-label" style={{ margin: 0 }}>
            Which link would you like to import from?
          </label>
          <input
            id="recipe-import-url"
            type="url"
            inputMode="url"
            className="input-field"
            placeholder="Enter link to the recipe"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={importing}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && url.trim() && !importing) onImportUrl(url.trim());
            }}
          />
          <div className="text-muted" style={{ fontSize: "0.75rem" }}>
            Paste a recipe page URL. We&apos;ll pull the ingredients and estimate nutrition.
          </div>
        </div>
      )}
    </Modal>
  );
}
