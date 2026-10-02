"use client";

import { Plus, ScrollText, Trash2 } from "lucide-react";
import { useState } from "react";
import { Toaster, toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { useEntityTitle } from "@/components/DocumentTitleSync";
import { useAppHeight } from "@/lib/useAppHeight";
import type { ImageSource } from "../../../../components/ImagePicker";
import SessionBar from "../../../../components/SessionBar";
import { TABLE_HELP } from "../../../../components/help";
import { api, campaignApi, errorMessage } from "../../../../lib/client";
import { EVENT_MAX } from "../../../../lib/constants";
import type { OracleEvent, TableSnapshot } from "../../../../types/oracle";

interface LogClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

// THE SESSION LOG — everything chosen from the banner, every revealed fact's trail, and the DM's
// own notes, newest first. It is what turns an improvised session into something on record.
export default function LogClient({ snapshot }: LogClientProps) {
  const campaign = snapshot.campaign;
  const base = campaignApi(campaign.id);
  const names = new Map(snapshot.entities.map((entity) => [entity.id, entity.name]));
  useAppHeight();
  useEntityTitle(campaign.name);

  // DATA
  const [events, setEvents] = useState<OracleEvent[]>(snapshot.events);

  // INPUT
  const [note, setNote] = useState("");

  // OPTIMISTIC CREATE — the note is painted at the top and the field cleared at once.
  async function addNote() {
    const body = note.trim();
    if (!body) return;
    const tempId = `tmp-${Date.now()}-${Math.random()}`;
    const currentScene = snapshot.scenes.find((scene) => scene.id === campaign.current_scene_id);
    setEvents((list) => [{ id: tempId, entity_id: null, scene_title: currentScene?.title ?? null, body, ts_created: new Date().toISOString() }, ...list]);
    setNote("");
    try {
      const saved = await api<OracleEvent>(`${base}/events`, "POST", { body });
      setEvents((list) => list.map((event) => (event.id === tempId ? saved : event)));
    } catch (error) {
      setEvents((list) => list.filter((event) => event.id !== tempId));
      toast.error(errorMessage(error, "Couldn't add the note"));
    }
  }

  async function deleteEvent(event: OracleEvent) {
    const previous = events;
    setEvents((list) => list.filter((entry) => entry.id !== event.id));
    try {
      await api(`${base}/events/${event.id}`, "DELETE");
    } catch (error) {
      setEvents(previous);
      toast.error(errorMessage(error, "Couldn't delete that"));
    }
  }

  return (
    // PAGE — a locked full-height shell with one scrolling body
    <div className="page page-with-bottom-bar orc-shell">

      {/* TOAST CONTAINER */}
      <Toaster position="top-center" />

      {/* SESSION BAR */}
      <SessionBar campaignId={campaign.id} campaignName={campaign.name} active="log" help={TABLE_HELP} />

      {/* SCROLLING BODY */}
      <div className="orc-page-body">
        <div className="page-container">

          {/* LOG CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">
              <h2 className="text-card-title"><ScrollText className="w-5 h-5" /> Session log</h2>
            </div>

            {/* CARD CONTENT */}
            <div className="card-content">

              {/* ADD ROW */}
              <div className="orc-note-row mb-4">

                {/* NOTE FIELD — not autofocused: the page is mostly opened to read the log. */}
                <input
                  id="orc-log-note"
                  className="input-field"
                  value={note}
                  maxLength={EVENT_MAX}
                  placeholder="Add a note"
                  aria-label="Add a note to the log"
                  onChange={(event) => setNote(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addNote();
                    }
                  }}
                />
                <Button className="btn-blue" disabled={!note.trim()} onClick={addNote}>
                  <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add</span>
                </Button>
              </div>

              {/* EMPTY PLACEHOLDER */}
              {events.length === 0 && (
                <div className="empty-state">
                  <p className="empty-state-title">Nothing logged yet</p>
                  <p className="empty-state-body">Answers you pick from the ideas banner and notes you add land here.</p>
                </div>
              )}

              {/* LOG ROWS */}
              {events.map((event) => (
                <div key={event.id} className="orc-log-row">

                  {/* WHEN AND WHERE */}
                  <div className="orc-log-meta">
                    <span suppressHydrationWarning>{formatTime(event.ts_created)}</span>
                    <span>{event.scene_title ?? "No scene"}</span>
                  </div>

                  {/* WHAT */}
                  <p className="orc-log-body">
                    {event.entity_id && names.has(event.entity_id) ? <strong>{names.get(event.entity_id)}: </strong> : null}
                    {event.body}
                  </p>

                  {/* DELETE */}
                  <Button className="btn-link-red" disabled={event.id.startsWith("tmp-")} onClick={() => deleteEvent(event)} title="Delete log entry" aria-label="Delete log entry">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
