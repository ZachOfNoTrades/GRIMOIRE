'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import type { DayArchetype } from '../types/dayArchetype';

// Session-page control: pick a day archetype, assign it, and generate the session deterministically.
export default function SessionEngineControls({ sessionId, currentArchetypeId, currentArchetypeName, onGenerated }: {
  sessionId: string;
  currentArchetypeId?: string | null;
  currentArchetypeName?: string | null; // passed with the session so the picker shows it immediately (no wait on the list fetch)
  onGenerated?: () => void;
}) {
  // DATA
  const [archetypes, setArchetypes] = useState<DayArchetype[]>([]);

  // INPUT
  const [selectedId, setSelectedId] = useState<string>(currentArchetypeId ?? '');

  // STATE
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false); // existing targets, no logged data → overwrite?
  const [blockerOpen, setBlockerOpen] = useState(false); // logged data present → cannot generate

  // Load the user's archetypes for the picker.
  useEffect(() => {
    fetch('/modules/golem/api/day-archetypes')
      .then((r) => r.json())
      .then((d) => setArchetypes(d.archetypes ?? []))
      .catch(() => {});
  }, []);

  // The session (and thus its assigned archetype) loads after this control mounts, so sync the picker
  // whenever the persisted archetype id changes. Keyed on the prop value, so a manual dropdown change
  // (which doesn't alter the persisted id) is never clobbered.
  useEffect(() => {
    setSelectedId(currentArchetypeId ?? '');
  }, [currentArchetypeId]);

  // Gate: inspect the session's current contents before generating.
  //   • logged exercises present        → block (generation only replaces TARGETS; logged work would be orphaned).
  //   • only unlogged target exercises   → confirm (they'll be overwritten).
  //   • empty                            → generate straight away.
  const handleGenerateClick = async () => {
    if (!selectedId) {
      toast.error('Pick a day archetype first');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/modules/golem/api/sessions/${sessionId}/segments`);
      if (!res.ok) { toast.error('Could not check existing exercises'); return; }
      const data = await res.json();
      const loggedCount = Array.isArray(data.exercises) ? data.exercises.length : 0;
      const targetCount = Array.isArray(data.targets) ? data.targets.length : 0;

      if (loggedCount > 0) { setBlockerOpen(true); return; }
      if (targetCount > 0) { setConfirmOpen(true); return; }
      await runGeneration();
    } catch {
      toast.error('Could not check existing exercises');
    } finally {
      setBusy(false);
    }
  };

  // Assign the chosen archetype, then run the engine (replaces existing target exercises).
  const runGeneration = async () => {
    setBusy(true);
    try {
      const assign = await fetch(`/modules/golem/api/sessions/${sessionId}/day-archetype`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day_archetype_id: selectedId }),
      });
      if (!assign.ok) { toast.error('Failed to assign archetype'); return; }

      const gen = await fetch(`/modules/golem/api/sessions/${sessionId}/generate-engine`, { method: 'POST' });
      const data = await gen.json();
      if (!gen.ok) { toast.error(data.error || 'Generation failed'); return; }

      toast.success('Session generated');
      onGenerated?.(); // refreshes the session segment list to show the injected exercises
    } catch {
      toast.error('Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    /* ENGINE CONTROLS CARD — standalone card on the session page (always shown, independent of the Session Info edit/view state). */
    <div className="card">

      {/* HEADER */}
      <div className="card-header">
        <h2 className="text-card-title">Engine Generation</h2>
      </div>

      {/* CONTENT */}
      <div className="card-content">

        {/* PICKER + GENERATE — stacked so the control row never overflows the narrow column / mobile width. */}
        <div className="flex flex-col gap-2">

          {/* DAY ARCHETYPE PICKER — seed the assigned archetype (name comes with the session) so it shows
              immediately; the full list arrives from /day-archetypes and replaces the seed once loaded. */}
          <select className="input-field" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select day archetype…</option>
            {(currentArchetypeId && currentArchetypeName && !archetypes.some((a) => a.id === currentArchetypeId)
              ? [{ id: currentArchetypeId, name: currentArchetypeName }, ...archetypes]
              : archetypes
            ).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* GENERATE BUTTON */}
          <Button className="btn-blue w-full justify-center" onClick={handleGenerateClick} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{busy ? 'Working…' : 'Assign & Generate'}</span>
          </Button>
        </div>
      </div>

      {/* OVERWRITE CONFIRMATION — existing (unlogged) target exercises will be replaced. */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Replace existing exercises?"
        disableClose={busy}
        footer={
          <>
            {/* CANCEL */}
            <Button onClick={() => setConfirmOpen(false)} disabled={busy} className="btn-link mr-auto">Cancel</Button>

            {/* CONFIRM */}
            <Button
              onClick={async () => { setConfirmOpen(false); await runGeneration(); }}
              disabled={busy}
              className="btn-blue"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              <span>Replace &amp; Generate</span>
            </Button>
          </>
        }
      >
        {/* BODY */}
        <p className="text-secondary">
          This session already has generated exercises (none logged yet). Generating will remove them and replace
          them with a fresh plan from the selected day archetype.
        </p>
      </Modal>

      {/* LOGGED-DATA BLOCKER — generation can't safely overwrite logged work. */}
      <Modal
        isOpen={blockerOpen}
        onClose={() => setBlockerOpen(false)}
        title="Can't generate over logged work"
        footer={
          /* ACKNOWLEDGE */
          <Button onClick={() => setBlockerOpen(false)} className="btn-blue">OK</Button>
        }
      >
        {/* BODY */}
        <div className="flex flex-col gap-2">

          {/* WARNING */}
          <p className="text-secondary flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This session already has logged exercises. The engine only replaces target exercises, so it
              won&apos;t touch what you&apos;ve logged.</span>
          </p>

          {/* INSTRUCTION */}
          <p className="text-secondary">
            To regenerate this session, manually delete the logged exercises first, then run Assign &amp; Generate again.
          </p>
        </div>
      </Modal>
    </div>
  );
}
