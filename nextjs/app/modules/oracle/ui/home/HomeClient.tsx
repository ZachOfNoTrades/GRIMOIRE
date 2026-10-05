"use client";

import { Dices, Monitor, Plus, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import { useConfirm } from "@/lib/useConfirm";
import { HOME_HELP } from "../../components/help";
import { api, errorMessage } from "../../lib/client";
import { NAME_MAX } from "../../lib/constants";
import type { CampaignSummary, OracleCampaign } from "../../types/oracle";

export default function HomeClient({ campaigns: initialCampaigns }: { campaigns: CampaignSummary[] }) {
  const router = useRouter();
  const { confirm, confirmModal } = useConfirm();
  const creatingRef = useRef(false); // a second submit while one is in flight is ignored

  // DATA
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>(initialCampaigns);

  // INPUT
  const [name, setName] = useState("");

  // STATE
  const [error, setError] = useState<string | null>(null);

  // OPTIMISTIC CREATE — the row is painted and the field cleared at once; the request follows.
  async function createCampaign() {
    const trimmed = name.trim().replace(/\s+/g, " ");
    setError(null);
    if (!trimmed) {
      setError("Enter a name");
      return;
    }
    if (creatingRef.current) return;
    creatingRef.current = true;

    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    setCampaigns((list) => [{ id: tempId, name: trimmed, display_code: "······", session_count: 0, ts_updated: new Date().toISOString() }, ...list]);
    setName("");
    try {
      const created = await api<OracleCampaign>("/modules/oracle/api/campaigns", "POST", { name: trimmed });
      setCampaigns((list) => list.map((campaign) => (campaign.id === tempId ? { id: created.id, name: created.name, display_code: created.display_code, session_count: 0, ts_updated: new Date().toISOString() } : campaign)));
      // A new campaign starts on Prep: the world, the first session and a map are made there.
      router.push(`/modules/oracle/ui/campaign/${created.id}?tab=prep`);
    } catch (createError) {
      setCampaigns((list) => list.filter((campaign) => campaign.id !== tempId));
      toast.error(errorMessage(createError, "Couldn't create the campaign"));
    } finally {
      creatingRef.current = false;
    }
  }

  async function deleteCampaign(campaign: CampaignSummary) {
    if (!(await confirm({ title: `Delete ${campaign.name}?`, message: "Its sessions, maps, cast, pictures and log are all removed. This cannot be undone.", confirmLabel: "Delete", danger: true }))) return;
    const previous = campaigns;
    setCampaigns((list) => list.filter((entry) => entry.id !== campaign.id));
    try {
      await api(`/modules/oracle/api/campaigns/${campaign.id}`, "DELETE");
    } catch (deleteError) {
      setCampaigns(previous);
      toast.error(errorMessage(deleteError, "Couldn't delete the campaign"));
    }
  }

  return (
    // PAGE
    <div className="page orc-shell orc-plain">
      <div className="page-container">

        {/* TOAST CONTAINER */}
        <Toaster position="top-center" />

        {/* HEADER ROW */}
        <div className="flex items-center justify-between mb-6">

          {/* BREADCRUMBS */}
          <Breadcrumbs className="breadcrumbs-inline" />

          {/* HEADER ACTIONS */}
          <div className="flex items-center gap-1">

            {/* SETTINGS LINK */}
            <Link className="btn btn-link" href="/modules/oracle/ui/settings" aria-label="Oracle settings" title="Settings">
              <Settings className="w-5 h-5" />
            </Link>

            {/* HELP */}
            <HelpButton title="Oracle" sections={HOME_HELP} className="btn-link shrink-0" />
          </div>
        </div>

        {/* PAGE TITLE */}
        <h1 className="text-page-title">
          <Dices className="w-7 h-7" /> Oracle
        </h1>

        {/* PAGE SUBTITLE */}
        <p className="text-page-subtitle mb-6">Run a tabletop session: a map with fog for the players, and ideas, stats and answers for you.</p>

        {/* NEW CAMPAIGN CARD */}
        <div className="card mb-6">

          {/* CARD HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">New campaign</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* ERROR */}
            {error && <div className="alert alert-red mb-3"><p className="alert-text">{error}</p></div>}

            {/* NAME ROW */}
            <div className="orc-note-row">

              {/* NAME FIELD — not autofocused: this page is mostly visited to open an existing
                  campaign, and focusing would raise the phone keyboard over the list. */}
              <input
                id="orc-campaign-name"
                className="input-field"
                value={name}
                maxLength={NAME_MAX}
                placeholder="Campaign name"
                aria-label="Campaign name"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    createCampaign();
                  }
                }}
              />

              {/* CREATE BUTTON */}
              <Button className="btn-green" onClick={createCampaign}>
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">New campaign</span>
              </Button>
            </div>
          </div>
        </div>

        {/* CAMPAIGN LIST */}
        <div className="orc-stack">

          {/* EMPTY PLACEHOLDER */}
          {campaigns.length === 0 && (
            <div className="empty-state">
              <p className="empty-state-title">No campaigns yet</p>
              <p className="empty-state-body">Name one above to start.</p>
            </div>
          )}

          {/* CAMPAIGN ROWS */}
          {campaigns.map((campaign) => {
            const isPending = campaign.id.startsWith("tmp-");
            return (
              <div key={campaign.id} className="orc-campaign">

                {/* CAMPAIGN SUMMARY */}
                <div className="orc-campaign-body">
                  <span className="orc-campaign-name">{campaign.name}</span>
                  <span className="orc-small text-secondary">
                    {campaign.session_count} {campaign.session_count === 1 ? "session" : "sessions"} · display code {campaign.display_code}
                  </span>
                </div>

                {/* CAMPAIGN ACTIONS */}
                <div className="orc-campaign-actions">
                  <a className="btn btn-blue" style={{ textDecoration: "none" }} href={isPending ? undefined : `/modules/oracle/ui/campaign/${campaign.id}?tab=table`} aria-disabled={isPending}>
                    <Dices className="w-4 h-4" /> Open DM Screen
                  </a>
                  <a className="btn btn-blue" style={{ textDecoration: "none" }} href={isPending ? undefined : `/oracle/${campaign.display_code}`} target="_blank" rel="noopener" aria-disabled={isPending}>
                    <Monitor className="w-4 h-4" /> Open Player Screen
                  </a>
                  <Button className="btn-link-red" disabled={isPending} onClick={() => deleteCampaign(campaign)} title="Delete campaign" aria-label={`Delete ${campaign.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* CONFIRM MODAL */}
        {confirmModal}
      </div>
    </div>
  );
}
