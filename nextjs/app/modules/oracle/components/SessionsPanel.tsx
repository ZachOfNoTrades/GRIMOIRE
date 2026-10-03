"use client";

import { Check, ExternalLink, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OracleSession } from "../types/oracle";
import { SESSION_TITLE_MAX } from "../lib/constants";

interface SessionsPanelProps {
  campaignId: string;
  sessions: OracleSession[];
  currentSessionId: string | null;
  onGoLive: (session: OracleSession) => void;
  onToggleDone: (session: OracleSession) => void;
  onAdd: (title: string) => void;
  onDelete: (session: OracleSession) => void;
}

// The session list: which session is live, which are done, and a link to each one's page.
// Shown in a drawer on the Table tab.
export default function SessionsPanel({ campaignId, sessions, currentSessionId, onGoLive, onToggleDone, onAdd, onDelete }: SessionsPanelProps) {
  // INPUT
  const [title, setTitle] = useState("");

  function add() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  }

  return (
    // SESSIONS PANEL
    <div className="orc-scenes">

      {/* EMPTY PLACEHOLDER */}
      {sessions.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">No sessions yet</p>
          <p className="empty-state-body">Add one below, or plan one on the Prep tab.</p>
        </div>
      )}

      {/* SESSION ROWS */}
      {sessions.map((session, index) => {
        const isLive = session.id === currentSessionId;
        const isPending = session.id.startsWith("tmp-");
        return (
          <div key={session.id} className="orc-scene" data-live={isLive ? "true" : undefined} data-done={session.is_done ? "true" : undefined}>

            {/* SESSION HEADER */}
            <div className="orc-scene-head">
              <span className="orc-scene-number">{index + 1}</span>
              <span className="orc-scene-title">{session.title}</span>
              {isLive && <span className="badge badge-green">Live</span>}
            </div>

            {/* SESSION DATE */}
            {session.session_date && <p className="orc-scene-summary">{session.session_date}</p>}

            {/* SESSION ACTIONS */}
            <div className="orc-scene-actions">
              {!isLive && (
                <Button className="btn-off" disabled={isPending} onClick={() => onGoLive(session)}>
                  <Play className="w-4 h-4" /> Go live
                </Button>
              )}
              <Button className="btn-off" disabled={isPending} onClick={() => onToggleDone(session)}>
                <Check className="w-4 h-4" /> {session.is_done ? "Not done" : "Done"}
              </Button>
              {!isPending && (
                <Link href={`/modules/oracle/ui/campaign/${campaignId}/session/${session.id}`} className="btn btn-off" title="Open the session">
                  <ExternalLink className="w-4 h-4" /> Open
                </Link>
              )}
              <Button className="btn-link-red" disabled={isPending} onClick={() => onDelete(session)} title="Delete session" aria-label={`Delete session ${session.title}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
      })}

      {/* ADD ROW */}
      <div className="orc-note-row">

        {/* TITLE FIELD — not autofocused: the drawer opens to read and switch sessions far more
            often than to add one, and focusing would raise the phone keyboard over the list. */}
        <input
          className="input-field"
          value={title}
          maxLength={SESSION_TITLE_MAX}
          placeholder="New session"
          aria-label="New session title"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button className="btn-off" disabled={!title.trim()} onClick={add} title="Add session" aria-label="Add session">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
