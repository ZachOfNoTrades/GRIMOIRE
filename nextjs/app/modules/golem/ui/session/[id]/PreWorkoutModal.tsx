"use client"

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal';
import toast from 'react-hot-toast';
import { ChevronLeft, Circle, CircleCheck, Dumbbell, Loader2, MapPin, Plus, Sparkles, StickyNote } from 'lucide-react';
import { PreSurvey, PreSurveyMuscleFatigue } from '../../../types/preSurvey';
import { SegmentSet, SegmentWithSets, TargetSegment, TargetSegmentSet } from '../../../types/segment';
import type { Location } from '../../../types/location';
import LocationPickerModal from '../../locations/LocationPickerModal';

const TOTAL_STEPS = 3;

// Warmup section's combined list — same shape as `combinedWarmupItems` on the
// session page. Receiving it as a prop avoids reimplementing the merge/order
// logic in two places.
export type WarmupWizardItem =
    | { type: 'logged'; key: string; effectiveOrder: number; segment: SegmentWithSets }
    | { type: 'target'; key: string; effectiveOrder: number; target: TargetSegment };

interface PreWorkoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: (preSurvey: PreSurvey) => void;
    sessionId: string;
    // When 'start', the footer shows Skip / Next & Save & Continue and onContinue fires after either choice.
    // didSave indicates whether the user saved (Save & Continue) vs skipped — the parent uses this to
    // decide whether to chain follow-up actions (e.g. auto-generating exercises).
    // When 'edit' (default), the footer shows Cancel / Next & Save.
    mode?: 'edit' | 'start';
    onContinue?: (didSave: boolean) => void;
    // Slide the wizard should land on when opened. Defaults to 0 (Notes).
    initialStep?: number;
    // Warmup slide data + handlers. The wizard renders the list but defers
    // picking/editing to the page-level ExercisePickerModal + EditSegmentModal
    // so we don't duplicate that state machine.
    warmupItems: WarmupWizardItem[];
    onAddWarmupSegment: () => void;
    onOpenWarmupSegment: (segment: SegmentWithSets) => void;
    onOpenWarmupTarget: (target: TargetSegment) => void;
    // Optional LLM-generation handler. When provided + warmupItems is empty
    // and canGenerate is true, the warmup slide offers a Generate Exercises
    // button that triggers the same plan generation used on the page.
    onGenerateExercises?: () => void;
    isGenerating?: boolean;
    canGenerate?: boolean;
}

// True when a logged set has any user-entered data (used to choose between
// showing the logged values vs the target).
function hasSetData(set: SegmentSet): boolean {
    return set.weight > 0
        || (set.reps != null && set.reps > 0)
        || set.rpe !== null
        || (set.time_seconds != null && set.time_seconds > 0)
        || (set.notes !== null && set.notes !== '');
}

function formatSetLine(set: SegmentSet | TargetSegmentSet): string {
    if (set.time_seconds != null && set.time_seconds > 0) {
        const timeLabel = set.time_seconds < 60
            ? `${set.time_seconds}s`
            : `${Math.floor(set.time_seconds / 60)}:${String(set.time_seconds % 60).padStart(2, '0')}`;
        return set.weight > 0 ? `${set.weight}lb x ${timeLabel}` : timeLabel;
    }
    const reps = set.reps ?? 0;
    return set.weight > 0 ? `${set.weight}lb x ${reps}` : `BW x ${reps}`;
}

export default function PreWorkoutModal({
    isOpen,
    onClose,
    onSaved,
    sessionId,
    mode = 'edit',
    onContinue,
    initialStep = 0,
    warmupItems,
    onAddWarmupSegment,
    onOpenWarmupSegment,
    onOpenWarmupTarget,
    onGenerateExercises,
    isGenerating = false,
    canGenerate = true,
}: PreWorkoutModalProps) {
    // DATA
    const [muscleGroups, setMuscleGroups] = useState<PreSurveyMuscleFatigue[]>([]); // Comes from `suggestions` — every muscle group
    const [suggestions, setSuggestions] = useState<Record<string, number>>({});

    // INPUT
    const [notes, setNotes] = useState("");
    const [fatigueByMuscle, setFatigueByMuscle] = useState<Record<string, number>>({});
    const [step, setStep] = useState(initialStep);

    // STATE
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [activeLocation, setActiveLocation] = useState<Location | null>(null);
    const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);

    // Load active location whenever the modal opens (cheap; no spinner needed).
    const loadActiveLocation = async () => {
        try {
            const resp = await fetch('/modules/golem/api/locations');
            if (!resp.ok) return;
            const data: Location[] = await resp.json();
            setActiveLocation(data.find((l) => l.is_active) ?? null);
        } catch {
            // best-effort; pill just hides
        }
    };

    // Reset to the requested initial slide whenever the modal opens. Load
    // existing pre-survey + auto-fatigue suggestions; prefill state with
    // suggestions when no saved survey exists; otherwise keep saved values.
    useEffect(() => {
        if (!isOpen) return;

        setStep(initialStep);
        void loadActiveLocation();

        const load = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/modules/golem/api/sessions/${sessionId}/pre-survey`);
                if (!response.ok) {
                    toast.error('Failed to load pre-workout data');
                    return;
                }

                const survey: PreSurvey = await response.json();

                // Build suggestion map + muscle-group list from the suggestions array
                const suggestionMap: Record<string, number> = {};
                for (const s of survey.suggestions) suggestionMap[s.muscle_group_id] = s.fatigue;
                setSuggestions(suggestionMap);
                setMuscleGroups(survey.suggestions);

                setNotes(survey.notes || "");

                if (survey.muscles.length > 0) {
                    // Existing saved values take precedence
                    const map: Record<string, number> = {};
                    for (const m of survey.muscles) map[m.muscle_group_id] = m.fatigue;
                    setFatigueByMuscle(map);
                } else {
                    // No saved survey — prefill with auto-calculated suggestions
                    setFatigueByMuscle({ ...suggestionMap });
                }
            } catch (error) {
                console.error('Error loading pre-workout data:', error);
                toast.error('Failed to load pre-workout data');
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [isOpen, sessionId, initialStep]);

    const handleSetFatigue = (muscleGroupId: string, value: number) => {
        setFatigueByMuscle((prev) => ({ ...prev, [muscleGroupId]: value }));
    };

    const handleClearFatigue = (muscleGroupId: string) => {
        setFatigueByMuscle((prev) => {
            const next = { ...prev };
            delete next[muscleGroupId];
            return next;
        });
    };

    // Replaces current fatigue selections with the auto-calculated suggestions from history.
    const handleApplySuggestions = () => {
        setFatigueByMuscle({ ...suggestions });
        toast.success('Applied suggested fatigue from history');
    };

    const handleSave = async (): Promise<boolean> => {
        setIsSaving(true);
        try {
            const payload = {
                notes: notes.trim() || null,
                muscles: Object.entries(fatigueByMuscle).map(([muscle_group_id, fatigue]) => ({
                    muscle_group_id,
                    fatigue,
                })),
            };

            const response = await fetch(`/modules/golem/api/sessions/${sessionId}/pre-survey`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                toast.error(errorData.error || 'Failed to save');
                return false;
            }

            const updated: PreSurvey = await response.json();
            toast.success('Saved');
            onSaved(updated);
            return true;
        } catch (error) {
            console.error('Error saving pre-workout data:', error);
            toast.error('Failed to save');
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const isLastStep = step === TOTAL_STEPS - 1;

    // Footer primary advances slide or saves & closes on the last slide.
    const handlePrimary = async () => {
        if (!isLastStep) {
            setStep(step + 1);
            return;
        }
        const ok = await handleSave();
        if (!ok) return;
        if (mode === 'start') {
            onContinue?.(true);
        } else {
            onClose();
        }
    };

    // Footer secondary is Skip (start mode — leaves the wizard but still
    // advances the parent workflow) or Cancel (edit mode — dismisses without
    // saving notes+fatigue). Warmups, if added, persist incrementally so they
    // survive Cancel regardless.
    const handleSecondary = () => {
        if (mode === 'start') {
            onContinue?.(false);
        } else {
            onClose();
        }
    };

    const primaryLabel = isSaving
        ? 'Saving...'
        : isLastStep
            ? (mode === 'start' ? 'Save & Continue' : 'Save')
            : 'Next';

    const secondaryLabel = mode === 'start' ? 'Skip' : 'Cancel';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={
                <span className="flex items-center gap-2">
                    <Dumbbell className="w-5 h-5" />
                    Pre-Workout
                </span>
            }
            disableClose={isSaving}
            subHeader={
                /* PROGRESS BAR */
                <div className="wizard-progress" aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}>
                    {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                        <span key={i} data-filled={i <= step ? "true" : "false"} />
                    ))}
                </div>
            }
            footer={
                <>
                    {/* SECONDARY — Skip (start mode) or Cancel (edit mode) pinned to the bottom-left via mr-auto. */}
                    <Button onClick={handleSecondary} disabled={isSaving} className="btn-link mr-auto">
                        {secondaryLabel}
                    </Button>

                    {/* BACK — bottom-right pair with Next. Hidden on step 0 since there's nowhere to go back to. */}
                    {step > 0 && (
                        <Button
                            onClick={() => setStep(step - 1)}
                            disabled={isSaving}
                            className="btn-off"
                            aria-label="Back"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            <span>Back</span>
                        </Button>
                    )}

                    {/* PRIMARY — Next on intermediate slides, Save / Save & Continue on the last slide. */}
                    <Button onClick={handlePrimary} disabled={isSaving || isLoading} className="btn-blue">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {primaryLabel}
                    </Button>
                </>
            }
        >

            {isLoading ? (

                // LOADING PLACEHOLDER
                <div className="loading-container py-8">
                    <div className="loading-spinner" />
                </div>
            ) : (
                <>

                    {/* STEP 0 — NOTES */}
                    {step === 0 && (
                        <div className="flex flex-col gap-3">

                            {/* ACTIVE LOCATION PILL — surfaces today's gym so the user
                                can confirm/swap before generating exercises. */}
                            <Button
                                onClick={() => setIsLocationPickerOpen(true)}
                                className="btn-off w-full justify-start"
                                disabled={isSaving}
                            >
                                <MapPin className="w-4 h-4" />
                                <span>{activeLocation ? activeLocation.name : "No location set"}</span>
                                <span className="ml-auto text-xs opacity-70">Change</span>
                            </Button>

                            {/* NOTES */}
                            <div className="flex flex-col gap-2">
                                <label className="text-secondary">Notes</label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    className="input-field resize-none field-sizing-content"
                                    placeholder="How are you feeling? Sleep, injuries, time constraints, focus..."
                                    rows={6}
                                    disabled={isSaving}
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 1 — WARMUP MINI-SESSION */}
                    {step === 1 && (
                        <div className="flex flex-col gap-3">

                            {/* SECTION LABEL */}
                            <label className="text-secondary">Warmup — tap an exercise to log sets</label>

                            {/* WARMUP LIST */}
                            {warmupItems.length === 0 ? (

                                // EMPTY STATE — offer LLM generation + the add-manually fallback
                                <div className="flex flex-col gap-2">
                                    <p className="text-secondary">No warmups yet.</p>
                                    {onGenerateExercises && (
                                        /* GENERATE BUTTON — runs the same plan-generation as the page; results populate warmupItems via parent state. */
                                        <Button
                                            className="btn-blue w-full justify-center"
                                            onClick={onGenerateExercises}
                                            disabled={isGenerating || !canGenerate || isSaving}
                                        >
                                            {isGenerating
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Sparkles className="w-4 h-4" />}
                                            <span>{isGenerating ? 'Generating...' : 'Generate Exercises'}</span>
                                        </Button>
                                    )}
                                    {onGenerateExercises && !canGenerate && (
                                        <p className="text-secondary text-sm">Add a session description first to generate exercises.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {warmupItems.map((item) => {
                                        if (item.type === 'logged') {
                                            const segment = item.segment;
                                            const isComplete = segment.sets.some((s) => s.is_completed);

                                            // Build the unified set list — logged values if entered, otherwise the target.
                                            const targetSets = segment.target?.sets ?? [];
                                            const setNumbers = [...new Set([
                                                ...segment.sets.map((s) => s.set_number),
                                                ...targetSets.map((ts) => ts.set_number),
                                            ])].sort((a, b) => a - b);
                                            const rows = setNumbers.map((num) => {
                                                const logged = segment.sets.find((s) => s.set_number === num);
                                                const target = targetSets.find((ts) => ts.set_number === num);
                                                const useLogged = logged && (logged.is_completed || hasSetData(logged));
                                                return { num, logged: useLogged ? logged : null, target: !useLogged ? target : null };
                                            }).filter((r) => r.logged || r.target);

                                            return (

                                                // WARMUP LOGGED SUB-CARD
                                                <div
                                                    key={item.key}
                                                    className="sub-card cursor-pointer"
                                                    onClick={() => onOpenWarmupSegment(segment)}
                                                >

                                                    {/* SUB-CARD HEADER */}
                                                    <div className="sub-card-header">
                                                        <div className="flex items-center gap-2">
                                                            {isComplete
                                                                ? <CircleCheck className="icon-green !w-4 !h-4 shrink-0" />
                                                                : <Circle className="icon-gray !w-4 !h-4 shrink-0" />
                                                            }
                                                            <h3 className="text-card-title">{segment.exercise_name}</h3>
                                                        </div>
                                                    </div>

                                                    {/* SUB-CARD CONTENT */}
                                                    <div className="sub-card-content">

                                                        {/* SEGMENT NOTES */}
                                                        {segment.notes && (
                                                            <div className="text-secondary flex items-start gap-1">
                                                                <StickyNote className="w-3 h-3 shrink-0 mt-1" />
                                                                <span className="break-words whitespace-pre-wrap">{segment.notes}</span>
                                                            </div>
                                                        )}

                                                        {/* SETS */}
                                                        {rows.length === 0 ? (
                                                            <p className="text-secondary">No sets recorded</p>
                                                        ) : (
                                                            <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">
                                                                {rows.map((row) => row.logged ? (

                                                                    // LOGGED SET ROW
                                                                    <p key={row.num} className={!row.logged.is_completed ? 'text-secondary' : ''}>
                                                                        <span>{formatSetLine(row.logged)}</span>
                                                                        {row.logged.rpe !== null && <span> @ {row.logged.rpe}RPE</span>}
                                                                        {row.logged.notes && <span className="text-secondary break-words whitespace-pre-wrap"> - {row.logged.notes}</span>}
                                                                    </p>
                                                                ) : row.target ? (

                                                                    // TARGET SET ROW
                                                                    <p key={row.num} className="text-secondary">
                                                                        <span>{formatSetLine(row.target)}</span>
                                                                        {row.target.rpe !== null && <span> @ {row.target.rpe}RPE</span>}
                                                                    </p>
                                                                ) : null)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const target = item.target;
                                        return (

                                            // WARMUP TARGET SUB-CARD (planned but not logged)
                                            <div
                                                key={item.key}
                                                className="sub-card cursor-pointer"
                                                onClick={() => onOpenWarmupTarget(target)}
                                            >

                                                {/* SUB-CARD HEADER */}
                                                <div className="sub-card-header">
                                                    <div className="flex items-center gap-2">
                                                        <Circle className="icon-gray !w-4 !h-4 shrink-0" />
                                                        <h3 className="text-card-title">{target.exercise_name}</h3>
                                                    </div>
                                                </div>

                                                {/* SUB-CARD CONTENT */}
                                                <div className="sub-card-content">

                                                    {/* TARGET SETS */}
                                                    {target.sets.length === 0 ? (
                                                        <p className="text-secondary">No target sets</p>
                                                    ) : (
                                                        <div className="flex flex-col gap-0 [&>p]:leading-tight [&>p]:py-px">
                                                            {target.sets.map((set) => (
                                                                <p key={`${set.is_warmup ? 'w' : 's'}-${set.set_number}`} className="text-secondary">
                                                                    <span>{formatSetLine(set)}</span>
                                                                    {set.rpe !== null && <span> @ {set.rpe}RPE</span>}
                                                                </p>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ADD WARMUP BUTTON — opens the page-level ExercisePickerModal */}
                            <Button
                                onClick={onAddWarmupSegment}
                                className="btn-link self-start"
                                disabled={isSaving}
                            >
                                <Plus className="w-4 h-4" />
                                <span>Add Warmup Exercise</span>
                            </Button>
                        </div>
                    )}

                    {/* STEP 2 — MUSCLE FATIGUE */}
                    {step === 2 && (
                        <div className="flex flex-col gap-2">

                            {/* SECTION HEADER */}
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-secondary">Muscle fatigue (1 = fresh, 2 = sore, 3 = fatigued)</label>

                                {/* AUTO-FILL BUTTON */}
                                <Button
                                    className="btn-link"
                                    onClick={handleApplySuggestions}
                                    disabled={isSaving}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span>Auto-fill</span>
                                </Button>
                            </div>

                            {/* MUSCLE GRID */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                                {muscleGroups.map((muscle) => {
                                    const value = fatigueByMuscle[muscle.muscle_group_id];
                                    const suggestion = suggestions[muscle.muscle_group_id];
                                    const matchesSuggestion = value !== undefined && value === suggestion;
                                    return (

                                        // MUSCLE ROW
                                        <div
                                            key={muscle.muscle_group_id}
                                            className="flex items-center justify-between gap-2 py-1"
                                        >

                                            {/* MUSCLE NAME + AUTO INDICATOR */}
                                            <span className="text-primary text-sm flex items-center gap-1 truncate">
                                                <span className="truncate">{muscle.muscle_group_name}</span>
                                                {matchesSuggestion && (
                                                    <Sparkles className="w-3 h-3 text-muted shrink-0" aria-label="auto" />
                                                )}
                                            </span>

                                            {/* FATIGUE BUTTONS — click selected button again to clear */}
                                            <div className="flex gap-1 shrink-0">
                                                {[1, 2, 3].map((rating) => (
                                                    <Button
                                                        key={rating}
                                                        onClick={() => value === rating
                                                            ? handleClearFatigue(muscle.muscle_group_id)
                                                            : handleSetFatigue(muscle.muscle_group_id, rating)}
                                                        disabled={isSaving}
                                                        className={`${value === rating ? "btn-blue" : "btn-off"} !px-2 !py-1 !min-w-8 text-sm`}
                                                    >
                                                        {rating}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* LOCATION PICKER — opens above the wizard via raised zIndex. */}
            <LocationPickerModal
                isOpen={isLocationPickerOpen}
                onClose={() => setIsLocationPickerOpen(false)}
                onChanged={() => void loadActiveLocation()}
                zIndex={70}
            />
        </Modal>
    );
}
