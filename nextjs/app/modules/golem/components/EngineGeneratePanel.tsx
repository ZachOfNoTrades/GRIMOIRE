'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// One generated slot row returned by the engine generate route.
interface GeneratedRow {
  role: string;
  exercise: string;
  sets: number;
  reps: number | null;
  weight: number | null;
  timeSeconds: number | null;
  rationale: string;
  baseline: boolean;
  pinWarning: string | null; // this slot's pinned exercise was overridden or substituted
}

// Control that triggers deterministic engine generation for a session and renders the produced plan.
export default function EngineGeneratePanel({ sessionId }: { sessionId: string }) {
  // DATA
  const [rows, setRows] = useState<GeneratedRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // STATE
  const [isGenerating, setIsGenerating] = useState(false);

  // Trigger engine generation (synchronous — the engine runs in well under a second).
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/modules/golem/api/sessions/${sessionId}/generate-engine`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || 'Generation failed');
        return;
      }
      setRows(data.generated as GeneratedRow[]);
      const pinWarnings: string[] = Array.isArray(data.warnings) ? data.warnings : [];
      setWarnings(pinWarnings);
      // A dropped/overridden pin must never pass unnoticed — pins encode injury constraints.
      if (pinWarnings.length > 0) toast(`Generated with ${pinWarnings.length} pin warning${pinWarnings.length > 1 ? 's' : ''}`, { icon: '⚠️' });
      else toast.success('Session generated');
    } catch {
      toast.error('Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    /* ENGINE GENERATE CARD */
    <div className="card">
      {/* HEADER */}
      <div className="card-header">
        <h3 className="text-card-title">Engine Generation</h3>

        {/* GENERATE BUTTON */}
        <Button className="btn-blue" onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span>{isGenerating ? 'Generating…' : 'Generate with Engine'}</span>
        </Button>
      </div>

      {/* CARD CONTENT */}
      <div className="card-content">

        {/* PIN WARNINGS — a slot's pinned exercise was kept despite missing equipment, or substituted.
            Shown above the table so it can't be missed by scrolling past the plan. */}
        {warnings.length > 0 && (
          <div className="alert-yellow mb-3">
            {/* TITLE */}
            <div className="alert-title">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Pinned exercise{warnings.length > 1 ? 's' : ''} not applied cleanly</span>
            </div>

            {/* WARNING LIST */}
            <ul className="alert-text list-disc pl-5">
              {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          </div>
        )}

        {/* RESULTS TABLE */}
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Exercise</th>
              <th>Prescription</th>
              <th>Why</th>
            </tr>
          </thead>

          <tbody>
            {/* EMPTY / LOADING PLACEHOLDER */}
            {rows === null && (
              <tr>
                <td colSpan={4} className="table-empty">
                  {isGenerating ? 'Generating…' : 'No plan yet — click Generate with Engine.'}
                </td>
              </tr>
            )}

            {/* GENERATED ROWS */}
            {rows?.map((row, index) => (
              <tr key={index}>
                <td>{row.role}</td>

                <td>
                  {row.exercise}
                  {row.baseline && <span className="badge-yellow">baseline</span>}
                  {row.pinWarning && <span className="badge-yellow">pin</span>}
                </td>

                <td>
                  {row.sets}×{row.timeSeconds != null ? `${row.timeSeconds}s` : (row.reps ?? '—')} @ {row.weight && row.weight > 0 ? `${row.weight} lb` : 'BW'}
                </td>

                <td>{row.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
