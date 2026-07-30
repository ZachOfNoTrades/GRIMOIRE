'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import type { DayArchetype } from '../types/dayArchetype';

// Create (archetype=null) or edit an archetype's name + description.
export default function DayArchetypeModal({
  isOpen, onClose, onSaved, archetype,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  archetype: DayArchetype | null;
}) {
  // INPUT
  const [name, setName] = useState(archetype?.name ?? '');
  const [description, setDescription] = useState(archetype?.description ?? '');

  // STATE
  const [isSaving, setIsSaving] = useState(false);

  // POST a new archetype or PUT name/description onto an existing one.
  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      const url = archetype ? `/modules/golem/api/day-archetypes/${archetype.id}` : '/modules/golem/api/day-archetypes';
      const res = await fetch(url, {
        method: archetype ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, description: description.trim() || null }),
      });
      if (!res.ok) {
        toast.error('Save failed');
        return;
      }
      toast.success(archetype ? 'Archetype saved' : 'Archetype created');
      onSaved();
      onClose();
    } catch {
      toast.error('Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    /* ARCHETYPE EDITOR MODAL */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={archetype ? 'Edit Archetype' : 'New Archetype'}
      disableClose={isSaving}
      footer={
        <>
          {/* CANCEL */}
          <Button onClick={onClose} disabled={isSaving} className="btn-link mr-auto">Cancel</Button>

          {/* SAVE */}
          <Button onClick={handleSave} disabled={isSaving} className="btn-blue">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            <span>{isSaving ? 'Saving…' : 'Save'}</span>
          </Button>
        </>
      }
    >
      {/* FORM */}
      <div className="flex flex-col gap-4">

        {/* NAME */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Name</label>
          <input
            className="input-field"
            type="text"
            placeholder="e.g. Leg Day"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoCapitalize="words"
          />
        </div>

        {/* DESCRIPTION */}
        <div className="flex flex-col gap-1">
          <label className="text-secondary">Description</label>
          <textarea
            className="input-field min-h-[80px] resize-y"
            rows={3}
            placeholder="Optional notes about this day…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
