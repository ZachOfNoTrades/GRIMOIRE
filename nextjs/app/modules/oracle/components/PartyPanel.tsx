"use client";

import { GripVertical, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GROUP_NAME_MAX, MAX_PARTY_GROUPS } from "../lib/constants";
import type { OraclePartyGroup, OraclePartyMember } from "../types/oracle";

interface PartyPanelProps {
  campaignId: string;
  party: OraclePartyMember[];
  groups: OraclePartyGroup[];
  onCreateGroup: () => void;
  onRenameGroup: (group: OraclePartyGroup, name: string) => void;
  onDisbandGroup: (group: OraclePartyGroup) => void;
  onMoveMember: (member: OraclePartyMember, groupId: string | null) => void;
  onClose: () => void;
}

const MAIN = "main";

// THE PARTY — who is with the party token and who is in each group. Make a group, then drag
// characters between the lists (pointer events, so it works with a finger as well as a mouse).
export default function PartyPanel({ campaignId, party, groups, onCreateGroup, onRenameGroup, onDisbandGroup, onMoveMember, onClose }: PartyPanelProps) {
  const dragRef = useRef<{ id: string; x: number; y: number; started: boolean } | null>(null);
  const overRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; name: string } | null>(null);
  const partyRef = useRef(party);
  partyRef.current = party;
  const moveRef = useRef(onMoveMember);
  moveRef.current = onMoveMember;

  // The drag runs on window listeners from the moment a row is pressed, as in the card table.
  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      if (!drag.started) {
        drag.started = true;
        setDragId(drag.id);
      }
      const member = partyRef.current.find((entry) => entry.id === drag.id);
      setGhost({ x: event.clientX, y: event.clientY, name: member?.name ?? "" });
      const target = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element.hasAttribute("data-drop-group"));
      const value = target ? (target.getAttribute("data-drop-group") as string) : null;
      overRef.current = value;
      setOver(value);
    }
    function finish(commit: boolean) {
      const drag = dragRef.current;
      dragRef.current = null;
      const target = overRef.current;
      overRef.current = null;
      setDragId(null);
      setOver(null);
      setGhost(null);
      if (!drag || !drag.started || !commit || target === null) return;
      const member = partyRef.current.find((entry) => entry.id === drag.id);
      const groupId = target === MAIN ? null : target;
      if (member && member.group_id !== groupId) moveRef.current(member, groupId);
    }
    const onUp = () => finish(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragRef.current) finish(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function row(member: OraclePartyMember) {
    return (
      <div
        key={member.id}
        className="orc-party-row"
        data-dragging={dragId === member.id ? "true" : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as Element).closest("input, button")) return;
          dragRef.current = { id: member.id, x: event.clientX, y: event.clientY, started: false };
        }}
      >
        <GripVertical className="w-4 h-4 orc-party-grip" aria-hidden />
        <span className="orc-party-name">{member.name}</span>
        <span className="orc-muted orc-small">Lv {member.level}</span>
      </div>
    );
  }

  const withParty = party.filter((member) => !member.group_id || !groups.some((group) => group.id === member.group_id));

  return (
    <div className="orc-party-panel" role="dialog" aria-label="Party">
      <div className="orc-party-panel-head">
        <span className="orc-label">Party</span>
        <button type="button" className="orc-map-hint-cancel" aria-label="Close" onClick={onClose}><X className="w-4 h-4" /></button>
      </div>

      {party.length === 0 && (
        <p className="orc-small text-secondary"><Link href={`/modules/oracle/ui/campaign/${campaignId}/prep`}>Add the party on Prep</Link></p>
      )}

      {/* MAIN PARTY */}
      {party.length > 0 && (
        <section className="orc-party-group" data-drop-group={MAIN} data-over={over === MAIN ? "true" : undefined}>
          <div className="orc-party-group-head"><span className="orc-party-group-name">With the party</span></div>
          {withParty.map(row)}
          {withParty.length === 0 && <span className="orc-small orc-muted">Empty</span>}
        </section>
      )}

      {/* GROUPS */}
      {groups.map((group) => (
        <section key={group.id} className="orc-party-group" data-drop-group={group.id} data-over={over === group.id ? "true" : undefined}>
          <div className="orc-party-group-head">
            <input
              className="orc-party-group-input"
              defaultValue={group.name}
              maxLength={GROUP_NAME_MAX}
              aria-label="Group name"
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== group.name) onRenameGroup(group, name);
                else event.target.value = group.name;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <button type="button" className="orc-map-hint-cancel" title="Disband the group" aria-label={`Disband ${group.name}`} onClick={() => onDisbandGroup(group)}><Trash2 className="w-4 h-4" /></button>
          </div>
          {party.filter((member) => member.group_id === group.id).map(row)}
          {party.every((member) => member.group_id !== group.id) && <span className="orc-small orc-muted">Drag characters here</span>}
        </section>
      ))}

      {party.length > 0 && (
        <Button className="btn-off" disabled={groups.length >= MAX_PARTY_GROUPS} onClick={onCreateGroup}>
          <Plus className="w-4 h-4" /> New group
        </Button>
      )}

      {ghost && <div className="orc-party-ghost" style={{ left: ghost.x + 10, top: ghost.y + 10 }}>{ghost.name}</div>}
    </div>
  );
}
