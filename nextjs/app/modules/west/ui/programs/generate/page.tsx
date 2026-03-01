"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import {
  ExerciseSummary,
  BACK_SQUAT_ID,
  CONVENTIONAL_DEADLIFT_ID,
  BENCH_PRESS_ID,
} from "../../../types/exercise";
import { calculateBlockSplit } from "../../../lib/powerliftingProgramGenerator";

export default function GeneratePowerliftingPage() {

  // DATA
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);

  // INPUT
  const [squatExerciseId, setSquatExerciseId] = useState(BACK_SQUAT_ID);
  const [benchExerciseId, setBenchExerciseId] = useState(BENCH_PRESS_ID);
  const [deadliftExerciseId, setDeadliftExerciseId] = useState(CONVENTIONAL_DEADLIFT_ID);
  const [squat1RM, setSquat1RM] = useState("");
  const [bench1RM, setBench1RM] = useState("");
  const [deadlift1RM, setDeadlift1RM] = useState("");
  const [totalWeeks, setTotalWeeks] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [generateWithLlm, setGenerateWithLlm] = useState(false);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Computed block split preview
  const blockPreview = useMemo(() => {
    const weeks = Number(totalWeeks);
    if (!weeks || weeks < 1) return null;

    const { hypertrophyWeeks, strengthWeeks, peakingWeeks } = calculateBlockSplit(weeks);
    return { totalWeeks: weeks, hypertrophyWeeks, strengthWeeks, peakingWeeks };
  }, [totalWeeks]);

  const router = useRouter();

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    try {
      const response = await fetch("/modules/west/api/exercises");
      if (!response.ok) throw new Error("Failed to fetch exercises");
      const data = await response.json();
      setExercises(data);
    } catch (error) {
      console.error("Error fetching exercises:", error);
      toast.error("Failed to load exercises");
    } finally {
      setIsLoading(false);
    }
  };

  // Validation check for submit button
  const isFormValid =
    squatExerciseId &&
    benchExerciseId &&
    deadliftExerciseId &&
    Number(squat1RM) > 0 &&
    Number(bench1RM) > 0 &&
    Number(deadlift1RM) > 0 &&
    Number(totalWeeks) >= 1 &&
    Number(daysPerWeek) >= 1;

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/modules/west/api/programs/generate-powerlifting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          squatExerciseId,
          benchExerciseId,
          deadliftExerciseId,
          squat1RM: Number(squat1RM),
          bench1RM: Number(bench1RM),
          deadlift1RM: Number(deadlift1RM),
          totalWeeks: Number(totalWeeks),
          daysPerWeek: Number(daysPerWeek),
          generateWithLlm: generateWithLlm,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to generate program");
        return;
      }

      const { id } = await response.json();
      toast.success("Program generated");
      router.push(`/modules/west/ui/programs/${id}`);
    } catch (error) {
      console.error("Error generating program:", error);
      toast.error("Failed to generate program");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return (

    // LOADING PLACEHOLDER
    <div className="page">
      <main className="page-container">
        <p className="text-page-subtitle text-center py-8">Loading...</p>
      </main>
    </div>
  );

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.back()}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <h1 className="text-page-title">Generate Powerlifting Program</h1>
        </div>

        {/* COMPETITION LIFTS CARD */}
        <div className="card mb-6">

          {/* HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">Competition Lifts</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* SQUAT ROW */}
            <div className="flex gap-4 items-end">

              {/* SQUAT EXERCISE SELECT */}
              <div className="flex-1">
                <label className="text-secondary">Squat</label>
                <select
                  value={squatExerciseId}
                  onChange={(e) => setSquatExerciseId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="" disabled>Select exercise...</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>

              {/* SQUAT 1RM INPUT */}
              <div className="w-32">
                <label className="text-secondary">1RM (lbs)</label>
                <input
                  type="number"
                  value={squat1RM}
                  onChange={(e) => setSquat1RM(e.target.value)}
                  placeholder="405"
                  className="input-field w-full"
                  min="0"
                />
              </div>
            </div>

            {/* BENCH ROW */}
            <div className="flex gap-4 items-end">

              {/* BENCH EXERCISE SELECT */}
              <div className="flex-1">
                <label className="text-secondary">Bench</label>
                <select
                  value={benchExerciseId}
                  onChange={(e) => setBenchExerciseId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="" disabled>Select exercise...</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>

              {/* BENCH 1RM INPUT */}
              <div className="w-32">
                <label className="text-secondary">1RM (lbs)</label>
                <input
                  type="number"
                  value={bench1RM}
                  onChange={(e) => setBench1RM(e.target.value)}
                  placeholder="275"
                  className="input-field w-full"
                  min="0"
                />
              </div>
            </div>

            {/* DEADLIFT ROW */}
            <div className="flex gap-4 items-end">

              {/* DEADLIFT EXERCISE SELECT */}
              <div className="flex-1">
                <label className="text-secondary">Deadlift</label>
                <select
                  value={deadliftExerciseId}
                  onChange={(e) => setDeadliftExerciseId(e.target.value)}
                  className="input-field w-full"
                >
                  <option value="" disabled>Select exercise...</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>

              {/* DEADLIFT 1RM INPUT */}
              <div className="w-32">
                <label className="text-secondary">1RM (lbs)</label>
                <input
                  type="number"
                  value={deadlift1RM}
                  onChange={(e) => setDeadlift1RM(e.target.value)}
                  placeholder="495"
                  className="input-field w-full"
                  min="0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SCHEDULE CARD */}
        <div className="card mb-6">

          {/* HEADER */}
          <div className="card-header">
            <h2 className="text-card-title">Schedule</h2>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* SCHEDULE ROW */}
            <div className="flex gap-4 items-end">

              {/* TOTAL WEEKS INPUT */}
              <div className="flex-1">
                <label className="text-secondary">Total Weeks</label>
                <input
                  type="number"
                  value={totalWeeks}
                  onChange={(e) => setTotalWeeks(e.target.value)}
                  className="input-field w-full"
                  min="1"
                />
              </div>

              {/* DAYS PER WEEK INPUT */}
              <div className="w-40">
                <label className="text-secondary">Days / Week</label>
                <input
                  type="number"
                  value={daysPerWeek}
                  onChange={(e) => setDaysPerWeek(e.target.value)}
                  className="input-field w-full"
                  min="1"
                />
              </div>
            </div>

            {/* BLOCK PREVIEW */}
            {blockPreview && (
              <div className="mt-4">

                {/* BLOCK SPLIT */}
                <p className="text-secondary">
                  <span className="font-medium">{blockPreview.totalWeeks} {blockPreview.totalWeeks === 1 ? "week" : "weeks"} total:</span>{" "}
                  {[
                    blockPreview.hypertrophyWeeks > 0 && `${blockPreview.hypertrophyWeeks}wk Hypertrophy`,
                    blockPreview.strengthWeeks > 0 && `${blockPreview.strengthWeeks}wk Strength`,
                    blockPreview.peakingWeeks > 0 && `${blockPreview.peakingWeeks}wk Peaking`,
                  ].filter(Boolean).join(" → ")}
                </p>
              </div>
            )}

            {/* LLM FIRST WEEK CHECKBOX */}
            <div className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                id="useAI"
                checked={generateWithLlm}
                onChange={(e) => setGenerateWithLlm(e.target.checked)}
                className="checkbox"
              />
              <label htmlFor="useLlm" className="text-secondary cursor-pointer">Generate first week with AI</label>
            </div>
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="flex justify-end">
          <Button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
          >
            <Zap className="w-4 h-4" />
            {isSubmitting ? ("Generating...") : "Generate Program"}
          </Button>
        </div>
      </main>
    </div>
  );
}
