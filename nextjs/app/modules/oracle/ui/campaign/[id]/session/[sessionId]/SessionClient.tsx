"use client";

import { ArrowLeft, Check, FileText, Play, Plus, ScrollText, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { blurOnEnter } from "@/lib/inputBehavior";
import { useAppHeight } from "@/lib/useAppHeight";
import SessionBar from "../../../../../components/SessionBar";
import { SESSION_HELP } from "../../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../../lib/client";
import { DRAFT_MAX, RECAP_MAX, SESSION_TITLE_MAX } from "../../../../../lib/constants";
import type { BuiltCast, OracleCampaign, OracleEntity, OracleSession } from "../../../../../types/oracle";

interface SessionClientProps {
  campaign: OracleCampaign;
  session: OracleSession;
  entities: OracleEntity[];
}

const KIND_LABELS = { creature: "Creature", person: "Person", place: "Location" } as const;

// SESSION — one night at the table: the rough notes going in, the cast those notes need, and the
// recap coming out. Go live makes it the session every generation at the Table is written for.
export default function SessionClient({ campaign: initialCampaign, session: initialSession, entities: initialEntities }: SessionClientProps) {
  const campaignId = initialCampaign.id;
  const base = campaignApi(campaignId);
  const sessionBase = `${base}/sessions/${initialSession.id}`;
  useAppHeight();

  // DATA
  const [campaign, setCampaign] = useState<OracleCampaign>(initialCampaign);
  const [session, setSession] = useState<OracleSession>(initialSession);
  const [entities, setEntities] = useState<OracleEntity[]>(initialEntities);
  const [proposal, setProposal] = useState<BuiltCast | null>(null);

  // INPUT — the text fields keep what is typed until focus leaves them
  const [title, setTitle] = useState(initialSession.title);
  const [date, setDate] = useState(initialSession.session_date ?? "");
  const [notes, setNotes] = useState(initialSession.notes);
  const [recap, setRecap] = useState(initialSession.recap);

  // STATE
  const [isBuilding, setIsBuilding] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // What the server last confirmed, so a blur with no change saves nothing.
  const savedRef = useRef<OracleSession>(initialSession);

  const isLive = campaign.current_session_id === session.id;
  useEntityTitle(`${session.title} · ${campaign.name}`);

  // Fields save when focus leaves them: there is nothing to review, and a Save button would be
  // one more thing to forget before the night starts.
  async function save(patch: { title?: string; session_date?: string | null; notes?: string; recap?: string; is_done?: boolean }): Promise<boolean> {
    const changed = Object.entries(patch).filter(([key, value]) => savedRef.current[key as keyof OracleSession] !== value);
    if (changed.length === 0) return true;
    try {
      const saved = await api<OracleSession>(sessionBase, "PUT", Object.fromEntries(changed));
      savedRef.current = saved;
      setSession(saved);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the session"));
      return false;
    }
  }

  function commitTitle(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setTitle(savedRef.current.title);
      return;
    }
    save({ title: trimmed });
  }

  async function goLive() {
    const previous = campaign;
    setCampaign({ ...campaign, current_session_id: session.id });
    try {
      setCampaign(await api<OracleCampaign>(base, "PUT", { current_session_id: session.id }));
    } catch (error) {
      setCampaign(previous);
      toast.error(errorMessage(error, "Couldn't make the session live"));
    }
  }

  async function build() {
    if (isBuilding) return;
    setIsBuilding(true);
    try {
      // Build reads the saved notes, so make sure what is on screen is what is saved.
      if (!(await save({ notes: notes.trim() }))) return;
      setProposal(await api<BuiltCast>(`${sessionBase}/build`, "POST"));
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't build the cast"));
    } finally {
      setIsBuilding(false);
    }
  }

  async function applyProposal() {
    if (!proposal || isApplying) return;
    setIsApplying(true);
    try {
      setEntities(await api<OracleEntity[]>(`${sessionBase}/build/apply`, "POST", proposal));
      setProposal(null);
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't add those to the campaign"));
    } finally {
      setIsApplying(false);
    }
  }

  return (
    // PAGE — a locked full-height shell with one scrolling body
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar campaignId={campaignId} campaignName={campaign.name} active="prep" help={SESSION_HELP} />

      {/* SCROLLING BODY */}
      <div className="orc-page-body">
        <div className="page-container">

          {/* SESSION HEADER */}
          <div className="orc-session-head">
            <Link href={`/modules/oracle/ui/campaign/${campaignId}/prep`} className="btn btn-link" title="Back to Prep">
              <ArrowLeft className="w-4 h-4" /> Prep
            </Link>

            {/* TITLE FIELD */}
            <input
              id="orc-session-title"
              className="input-field orc-session-title"
              value={title}
              maxLength={SESSION_TITLE_MAX}
              aria-label="Session title"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={(event) => commitTitle(event.target.value)}
              onKeyDown={blurOnEnter}
            />

            {/* DATE FIELD */}
            <input
              id="orc-session-date"
              type="date"
              className="input-field orc-session-date"
              value={date}
              aria-label="Session date"
              onChange={(event) => setDate(event.target.value)}
              onBlur={(event) => save({ session_date: event.target.value || null })}
            />

            {/* STATUS */}
            {isLive ? <span className="badge badge-green">Live</span> : (
              <Button className="btn-green" onClick={goLive}>
                <Play className="w-4 h-4" /> Go live
              </Button>
            )}
            <Button className="btn-off" onClick={() => save({ is_done: !session.is_done })}>
              <Check className="w-4 h-4" /> {session.is_done ? "Not done" : "Done"}
            </Button>
          </div>

          <div className="orc-columns" data-columns="3">

            {/* NOTES COLUMN */}
            <div className="orc-stack">

              {/* NOTES CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><FileText className="w-5 h-5" /> Rough notes</h2>
                </div>
                <div className="card-content orc-form">

                  {/* NOTES FIELD — not autofocused: long text the DM pastes, not types. */}
                  <textarea
                    id="orc-session-notes"
                    className="input-field orc-textarea"
                    rows={16}
                    value={notes}
                    maxLength={DRAFT_MAX}
                    placeholder="Paste your plan for the night in any shape. The Table writes every idea against it."
                    aria-label="Rough session notes"
                    onChange={(event) => setNotes(event.target.value)}
                    onBlur={(event) => save({ notes: event.target.value.trim() })}
                  />

                  {/* BUILD ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">Saved when you leave the box.</span>
                    <Button className="btn-blue" disabled={isBuilding || notes.trim().length < 20} onClick={build}>
                      <Sparkles className="w-4 h-4" /> {isBuilding ? "Building…" : "Build cast"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* CAST COLUMN */}
            <div className="orc-stack">

              {/* PROPOSAL CARD — shown after Build cast, until it is added or discarded */}
              {proposal && (
                <div className="card">
                  <div className="card-header">
                    <h2 className="text-card-title"><Sparkles className="w-5 h-5" /> Proposed cast</h2>
                  </div>
                  <div className="card-content orc-stack">
                    {proposal.entities.map((entity, index) => (
                      <div key={`${entity.name}-${index}`} className="orc-proposal">
                        <span className="orc-proposal-title">{entity.name} <span className="orc-muted">· {KIND_LABELS[entity.kind]}{entity.cr ? ` · CR ${entity.cr}` : ""}</span></span>
                        <span className="orc-section-text">{entity.details}</span>
                        {entity.dm_notes && <span className="orc-section-text orc-muted">DM only: {entity.dm_notes}</span>}
                      </div>
                    ))}

                    {/* PROPOSAL ACTIONS */}
                    <div className="orc-card-actions">
                      <Button className="btn-off" disabled={isApplying} onClick={() => setProposal(null)}>Discard</Button>
                      <Button className="btn-green" disabled={isApplying} onClick={applyProposal}>
                        <Plus className="w-4 h-4" /> {isApplying ? "Adding…" : "Add to campaign"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* CAST CARD — the whole campaign's cast; entries are shared across sessions */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Users className="w-5 h-5" /> Cast</h2>
                </div>
                <div className="card-content orc-stack">
                  {entities.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No cast yet</p>
                      <p className="empty-state-body">Build it from the notes, or add entries from the Table tab.</p>
                    </div>
                  )}
                  {entities.map((entity) => (
                    <div key={entity.id} className="orc-proposal">
                      <span className="orc-proposal-title">{entity.name} <span className="orc-muted">· {KIND_LABELS[entity.kind]}</span></span>
                      {entity.details && <span className="orc-section-text">{entity.details}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RECAP COLUMN */}
            <div className="orc-stack">

              {/* RECAP CARD */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><ScrollText className="w-5 h-5" /> Recap</h2>
                </div>
                <div className="card-content orc-form">

                  {/* RECAP FIELD */}
                  <textarea
                    id="orc-session-recap"
                    className="input-field orc-textarea"
                    rows={12}
                    value={recap}
                    maxLength={RECAP_MAX}
                    placeholder="What happened. Written after the night, or as you go; the next session's ideas draw on it."
                    aria-label="Session recap"
                    onChange={(event) => setRecap(event.target.value)}
                    onBlur={(event) => save({ recap: event.target.value.trim() })}
                  />
                  <span className="orc-small text-secondary">Saved when you leave the box.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
