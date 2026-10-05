"use client";

import { ArrowLeft, Check, FileText, Play, Plus, Save, ScrollText, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import SessionBar from "../../../../../components/SessionBar";
import { SESSION_HELP } from "../../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../../lib/client";
import { DRAFT_MAX, RECAP_MAX, SESSION_TITLE_MAX } from "../../../../../lib/constants";
import { saveOnShortcut, useUnsavedWarning } from "../../../../../lib/useUnsavedWarning";
import type { BuiltEntities, OracleCampaign, OracleEntity, OracleSession } from "../../../../../types/oracle";

interface SessionClientProps {
  campaign: OracleCampaign;
  session: OracleSession;
  entities: OracleEntity[];
}

const KIND_LABELS = { creature: "Creature", person: "Person", place: "Location", item: "Item" } as const;

// SESSION — one night at the table: the rough notes going in, the entities those notes need, and the
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
  const [proposal, setProposal] = useState<BuiltEntities | null>(null);

  // INPUT — the text fields keep what is typed until focus leaves them
  const [title, setTitle] = useState(initialSession.title);
  const [date, setDate] = useState(initialSession.session_date ?? "");
  const [notes, setNotes] = useState(initialSession.notes);
  const [recap, setRecap] = useState(initialSession.recap);

  // STATE
  const [isBuilding, setIsBuilding] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // `session` is what the server last confirmed; a field is dirty while it differs from it.
  const isNotesDirty = notes.trim() !== session.notes;
  const isRecapDirty = recap.trim() !== session.recap;
  const isDirty = isNotesDirty || isRecapDirty || (title.trim() !== "" && title.trim() !== session.title) || (date || null) !== session.session_date;
  useUnsavedWarning(isDirty);

  const isLive = campaign.current_session_id === session.id;
  useEntityTitle(`${session.title} · ${campaign.name}`);

  // Fields save only on the Save buttons or Ctrl+S; nothing is written while typing. Only changed keys go up.
  async function save(patch: { title?: string; session_date?: string | null; notes?: string; recap?: string; is_done?: boolean }): Promise<boolean> {
    const changed = Object.entries(patch).filter(([key, value]) => session[key as keyof OracleSession] !== value);
    if (changed.length === 0) return true;
    setIsSaving(true);
    try {
      const saved = await api<OracleSession>(sessionBase, "PUT", Object.fromEntries(changed));
      setSession(saved);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the session"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // Save everything on the page that differs from the server.
  function saveAll() {
    return save({ title: title.trim() || session.title, session_date: date || null, notes: notes.trim(), recap: recap.trim() });
  }

  // SAVE BUTTON — one in the header and one per text card; each saves the whole page.
  const saveButton = (
    <Button className={isDirty ? "btn-green" : "btn-off"} disabled={!isDirty || isSaving} onClick={saveAll} title="Save the session (Ctrl+S)">
      <Save className="w-4 h-4" /> {isSaving ? "Saving…" : isDirty ? "Save" : "Saved"}
    </Button>
  );

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
      setProposal(await api<BuiltEntities>(`${sessionBase}/build`, "POST"));
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't build the entities"));
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
              onKeyDown={saveOnShortcut(saveAll)}
            />

            {/* DATE FIELD */}
            <input
              id="orc-session-date"
              type="date"
              className="input-field orc-session-date"
              value={date}
              aria-label="Session date"
              onChange={(event) => setDate(event.target.value)}
            />

            {/* SAVE */}
            {saveButton}

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
                    onKeyDown={saveOnShortcut(saveAll)}
                  />

                  {/* BUILD ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">{isNotesDirty ? "Unsaved changes. Save before leaving the page." : "The Table writes every idea against these."}</span>
                    <div className="orc-row-actions">
                      <Button className="btn-blue" disabled={isBuilding || isSaving || notes.trim().length < 20} onClick={build}>
                        <Sparkles className="w-4 h-4" /> {isBuilding ? "Building…" : "Build entities"}
                      </Button>
                      {saveButton}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ENTITIES COLUMN */}
            <div className="orc-stack">

              {/* PROPOSAL CARD — shown after Build entities, until it is added or discarded */}
              {proposal && (
                <div className="card">
                  <div className="card-header">
                    <h2 className="text-card-title"><Sparkles className="w-5 h-5" /> Proposed entities</h2>
                  </div>
                  <div className="card-content orc-stack">
                    {proposal.entities.map((entity, index) => (
                      <div key={`${entity.name}-${index}`} className="orc-proposal">
                        <span className="orc-proposal-title"><span>{entity.name}</span><span className="orc-muted">{KIND_LABELS[entity.kind]}{entity.cr ? ` · CR ${entity.cr}` : ""}</span></span>
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

              {/* ENTITIES CARD — the whole campaign's entities; entries are shared across sessions */}
              <div className="card">
                <div className="card-header">
                  <h2 className="text-card-title"><Users className="w-5 h-5" /> Entities</h2>
                </div>
                <div className="card-content orc-stack">
                  {entities.length === 0 && (
                    <div className="empty-state">
                      <p className="empty-state-title">No entities yet</p>
                      <p className="empty-state-body">Build it from the notes, or add entities from the Table tab.</p>
                    </div>
                  )}
                  {[...entities].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })).map((entity) => (
                    <div key={entity.id} className="orc-proposal">
                      <span className="orc-proposal-title"><span>{entity.name}</span><span className="orc-muted">{KIND_LABELS[entity.kind]}</span></span>
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
                    onKeyDown={saveOnShortcut(saveAll)}
                  />

                  {/* RECAP ROW */}
                  <div className="orc-card-actions">
                    <span className="orc-small text-secondary">{isRecapDirty ? "Unsaved changes. Save before leaving the page." : "The next session's ideas draw on this."}</span>
                    {saveButton}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
