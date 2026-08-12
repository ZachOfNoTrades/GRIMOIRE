"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

// Shows how — or whether — this user's notification emails can actually be delivered, and offers
// the one-click fix when they can't. Every notification toggle in the app promises an email, so
// each of those screens renders this underneath: a reminder switch that silently sends nothing is
// worse than no switch at all.
//
// Sending goes through the user's own Gmail account (lib/googleMail.ts), authorized by the
// gmail.send scope their Google sign-in asks for. Anyone who last signed in before that scope
// existed still holds a session without it, so "Connect Gmail" is simply another sign-in.

interface EmailDeliveryStatusResponse {
  transport: "gmail" | "smtp" | null;
  canConnectGmail: boolean;
  address: string | null;
}

export function EmailDeliveryStatus() {

  // DATA — delivery status for the signed-in user, from /api/email/status.
  const [status, setStatus] = useState<EmailDeliveryStatusResponse | null>(null);

  // STATE
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    fetch("/api/email/status")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: EmailDeliveryStatusResponse | null) => setStatus(data))
      .catch(() => {});
  }, []);

  // Nothing to say until the status is known — a settings page shouldn't flash a warning that
  // resolves to "everything is fine" a moment later.
  if (!status) return null;

  // CONNECT — re-run the Google sign-in so it can grant the send scope, returning to this page.
  function connectGmail() {
    setIsConnecting(true);
    signIn("google", { callbackUrl: window.location.href });
  }

  if (status.transport === "gmail") {
    return (
      /* DELIVERY NOTE — connected */
      <p className="settings-group-note">
        Notification emails are sent from your Gmail account
        {status.address ? ` (${status.address})` : ""}.
      </p>
    );
  }

  if (status.transport === "smtp") {
    return (
      /* DELIVERY NOTE — app mail server */
      <p className="settings-group-note">
        Notification emails are sent from the app&apos;s mail server
        {status.address ? ` to ${status.address}` : ""}.
      </p>
    );
  }

  return (
    /* DELIVERY WARNING — nothing can send yet */
    <div className="alert-yellow" style={{ marginTop: "0.75rem" }}>

      {/* WARNING TITLE */}
      <div className="alert-title">Email notifications are off</div>

      {/* WARNING TEXT */}
      <div className="alert-text">
        {status.canConnectGmail
          ? "Grimoire sends these emails from your own Gmail account. Connect it once and every notification you switch on here starts arriving."
          : "No mail transport is configured, so nothing can be sent yet."}
      </div>

      {status.canConnectGmail && (
        /* CONNECT BUTTON */
        <div style={{ marginTop: "0.75rem" }}>
          <Button className="btn-blue" onClick={connectGmail} disabled={isConnecting}>
            {isConnecting ? "Opening Google…" : "Connect Gmail"}
          </Button>
        </div>
      )}
    </div>
  );
}
