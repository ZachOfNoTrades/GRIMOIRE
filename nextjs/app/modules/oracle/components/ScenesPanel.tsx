"use client";

import { Check, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OracleScene } from "../types/oracle";
import { SCENE_TITLE_MAX } from "../lib/constants";

interface ScenesPanelProps {
  scenes: OracleScene[];
  currentSceneId: string | null;
  onGoLive: (scene: OracleScene) => void;
  onToggleDone: (scene: OracleScene) => void;
  onAdd: (title: string) => void;
  onDelete: (scene: OracleScene) => void;
}

// The scene list: which scene is live, which are done. Shown in a drawer on the Table tab.
export default function ScenesPanel({ scenes, currentSceneId, onGoLive, onToggleDone, onAdd, onDelete }: ScenesPanelProps) {
  // INPUT
  const [title, setTitle] = useState("");

  function add() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  }

  return (
    // SCENES PANEL
    <div className="orc-scenes">

      {/* EMPTY PLACEHOLDER */}
      {scenes.length === 0 && (
        <div className="empty-state">
          <p className="empty-state-title">No scenes yet</p>
          <p className="empty-state-body">Add one below, or build them from your notes on the Prep tab.</p>
        </div>
      )}

      {/* SCENE ROWS */}
      {scenes.map((scene, index) => {
        const isLive = scene.id === currentSceneId;
        const isPending = scene.id.startsWith("tmp-");
        return (
          <div key={scene.id} className="orc-scene" data-live={isLive ? "true" : undefined} data-done={scene.is_done ? "true" : undefined}>

            {/* SCENE HEADER */}
            <div className="orc-scene-head">
              <span className="orc-scene-number">{index + 1}</span>
              <span className="orc-scene-title">{scene.title}</span>
              {isLive && <span className="badge badge-green">Live</span>}
            </div>

            {/* SCENE SUMMARY */}
            {scene.summary && <p className="orc-scene-summary">{scene.summary}</p>}

            {/* SCENE ACTIONS */}
            <div className="orc-scene-actions">
              {!isLive && (
                <Button className="btn-off" disabled={isPending} onClick={() => onGoLive(scene)}>
                  <Play className="w-4 h-4" /> Go live
                </Button>
              )}
              <Button className="btn-off" disabled={isPending} onClick={() => onToggleDone(scene)}>
                <Check className="w-4 h-4" /> {scene.is_done ? "Not done" : "Done"}
              </Button>
              <Button className="btn-link-red" disabled={isPending} onClick={() => onDelete(scene)} title="Delete scene" aria-label={`Delete scene ${scene.title}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        );
      })}

      {/* ADD ROW */}
      <div className="orc-note-row">

        {/* TITLE FIELD — not autofocused: the drawer opens to read and switch scenes far more
            often than to add one, and focusing would raise the phone keyboard over the list. */}
        <input
          className="input-field"
          value={title}
          maxLength={SCENE_TITLE_MAX}
          placeholder="New scene"
          aria-label="New scene title"
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button className="btn-off" disabled={!title.trim()} onClick={add} title="Add scene" aria-label="Add scene">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
