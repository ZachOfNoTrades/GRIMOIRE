"use client";

import { useState } from "react";
import { CheckCircle2, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UnsubscribeClientProps {
  token: string;
  // Human label for the single notification this link came from.
  label: string;
  // True when the link already targets every notification, so the widen button is pointless.
  isAll: boolean;
}

export default function UnsubscribeClient({ token, label, isAll }: UnsubscribeClientProps) {
  // STATE
  const [submitting, setSubmitting] = useState<"one" | "all" | null>(null);
  const [doneLabel, setDoneLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unsubscribe(scope: "one" | "all") {
    setSubmitting(scope);
    setError(null);
    try {
      const response = await fetch("/api/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scope === "all" ? { token, kind: "all" } : { token }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error ?? "Failed to unsubscribe");
        return;
      }
      setDoneLabel(json?.label ?? label);
    } catch {
      setError("Failed to reach the server. Try again in a moment.");
    } finally {
      setSubmitting(null);
    }
  }

  // CONFIRMED STATE — replaces the whole card body once the unsubscribe lands.
  if (doneLabel) {
    return (
      <div className="flex flex-col items-center text-center gap-3 py-2">
        {/* SUCCESS ICON */}
        <CheckCircle2 className="w-10 h-10 text-green-400" />

        {/* CONFIRMATION HEADING */}
        <h2 className="text-card-title">Unsubscribed</h2>

        {/* CONFIRMATION DETAIL */}
        <p className="text-secondary text-sm">
          You will no longer receive <strong>{doneLabel}</strong> emails. You can turn them back on
          any time from that module&apos;s settings page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* WHAT THIS TURNS OFF */}
      <p className="text-secondary text-sm">
        This will stop <strong>{label}</strong> emails from being sent to you. Nothing else about
        your account changes, and you can re-enable it any time from that module&apos;s settings.
      </p>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="alert-red">
          <p className="alert-text">{error}</p>
        </div>
      )}

      {/* ACTIONS */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          className="btn-red"
          onClick={() => unsubscribe("one")}
          disabled={submitting !== null}
        >
          <MailX className="w-4 h-4" />
          {submitting === "one" ? "Unsubscribing..." : `Unsubscribe from ${label}`}
        </Button>

        {!isAll && (
          <Button
            className="btn-off"
            onClick={() => unsubscribe("all")}
            disabled={submitting !== null}
          >
            {submitting === "all" ? "Unsubscribing..." : "Unsubscribe from all emails"}
          </Button>
        )}
      </div>
    </div>
  );
}
