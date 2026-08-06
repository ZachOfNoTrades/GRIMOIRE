"use client";

import { useState, useEffect } from "react";
import { BackLink } from "@/components/BackLink";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Program, ProgramBlock, ProgramWeek } from "../../types/program";
import { WeeklyMuscleGroupVolume } from "../../types/volumeLandmark";

interface WeekOption {
  weekId: string;
  label: string;
  isCurrent: boolean;
}

export default function VolumePage() {

  // DATA
  const [program, setProgram] = useState<Program | null>(null);
  const [volumeData, setVolumeData] = useState<WeeklyMuscleGroupVolume[]>([]);

  // INPUT
  const [selectedWeekId, setSelectedWeekId] = useState<string>("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVolume, setIsLoadingVolume] = useState(false);
  const [showAll, setShowAll] = useState(false);


  // Build week options from the program hierarchy
  const weekOptions: WeekOption[] = [];
  if (program) {
    for (const block of program.blocks) {
      for (const week of block.weeks) {
        weekOptions.push({
          weekId: week.id,
          label: `${block.name} — Week ${week.week_number}${week.name ? ` (${week.name})` : ""}`,
          isCurrent: week.is_current,
        });
      }
    }
  }

  // Find the max bar value for scaling
  const maxBarValue = Math.max(
    ...volumeData.map((v) => Math.max(v.working_sets, v.mrv ?? 0)),
    1
  );

  // Filter muscle groups: show all, or only those with data or configured landmarks
  const filteredVolume = showAll
    ? volumeData
    : volumeData.filter((v) => v.working_sets > 0 || v.mev !== null || v.mrv !== null);

  // LOAD PROGRAM
  useEffect(() => {
    fetchProgram();
  }, []);

  // LOAD VOLUME DATA WHEN WEEK CHANGES
  useEffect(() => {
    if (selectedWeekId) {
      fetchVolumeData(selectedWeekId);
    }
  }, [selectedWeekId]);

  const fetchProgram = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/modules/golem/api/programs/current");
      if (response.ok) {
        const data: Program = await response.json();
        setProgram(data);

        // Default to the current week
        for (const block of data.blocks) {
          for (const week of block.weeks) {
            if (week.is_current) {
              setSelectedWeekId(week.id);
              return;
            }
          }
        }

        // Fallback to the last week if no current
        const lastBlock = data.blocks[data.blocks.length - 1];
        if (lastBlock) {
          const lastWeek = lastBlock.weeks[lastBlock.weeks.length - 1];
          if (lastWeek) {
            setSelectedWeekId(lastWeek.id);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching program:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVolumeData = async (weekId: string) => {
    setIsLoadingVolume(true);
    try {
      const response = await fetch(`/modules/golem/api/volume/weekly?weekId=${weekId}`);
      if (response.ok) {
        const data = await response.json();
        setVolumeData(data);
      }
    } catch (error) {
      console.error("Error fetching volume data:", error);
    } finally {
      setIsLoadingVolume(false);
    }
  };

  // Get bar color based on volume vs landmarks
  const getBarColor = (v: WeeklyMuscleGroupVolume): string => {
    if (v.mev === null || v.mrv === null) return "var(--btn-blue-bg)"; // no landmarks configured
    if (v.working_sets < v.mev) return "var(--color-gray)"; // below MEV
    if (v.working_sets <= v.mrv) return "var(--btn-green-bg)"; // within range
    return "var(--btn-red-bg)"; // above MRV
  };

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <main className="page-container">
          <div className="loading-container py-12">
            <div className="loading-spinner" />
          </div>
        </main>
      </div>
    );
  }

  return (

    // PAGE
    <div className="page">
      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <BackLink
            fallback="/modules/golem/ui/home"
            className="btn btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </BackLink>

          {/* TITLE */}
          <h1 className="text-page-title">
            <BarChart3 className="w-8 h-8" />
            Weekly Volume
          </h1>
        </div>

        {!program ? (

          // NO PROGRAM
          <p className="text-secondary text-center py-8">No active program found</p>
        ) : (
          <>
            {/* WEEK SELECTOR CARD */}
            <div className="card mb-6">

              {/* CARD CONTENT */}
              <div className="card-content">

                {/* WEEK DROPDOWN */}
                <select
                  value={selectedWeekId}
                  onChange={(e) => setSelectedWeekId(e.target.value)}
                  className="input-field w-full"
                >
                  {weekOptions.map((opt) => (
                    <option key={opt.weekId} value={opt.weekId}>
                      {opt.label}{opt.isCurrent ? " (Current)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* VOLUME BARS CARD */}
            <div className="card">

              {/* CARD HEADER */}
              <div className="card-header">

                {/* TITLE */}
                <h2 className="text-card-title">Working Sets by Muscle Group</h2>

                {/* SHOW ALL TOGGLE */}
                <Button
                  onClick={() => setShowAll(!showAll)}
                  className="btn-link text-sm"
                >
                  {showAll ? "Hide empty" : "Show all"}
                </Button>
              </div>

              {/* CARD CONTENT */}
              <div className="card-content">
                {isLoadingVolume ? (

                  // LOADING PLACEHOLDER
                  <div className="loading-container py-8">
                    <div className="loading-spinner" />
                  </div>
                ) : filteredVolume.length === 0 ? (

                  // EMPTY STATE
                  <p className="text-secondary text-center py-8">No volume data for this week</p>
                ) : (

                  // VOLUME BARS
                  <div className="flex flex-col gap-3">
                    {filteredVolume.map((v) => {
                      const barWidth = maxBarValue > 0 ? (v.working_sets / maxBarValue) * 100 : 0;
                      const mevPosition = v.mev !== null && maxBarValue > 0 ? (v.mev / maxBarValue) * 100 : null;
                      const mrvPosition = v.mrv !== null && maxBarValue > 0 ? (v.mrv / maxBarValue) * 100 : null;

                      return (
                        <div key={v.muscle_group_id} className="flex flex-col gap-1">

                          {/* LABEL ROW */}
                          <div className="flex items-center justify-between text-sm">

                            {/* MUSCLE GROUP NAME */}
                            <span className="text-primary font-medium">{v.muscle_group_name}</span>

                            {/* NUMERIC VALUES */}
                            <span className="text-secondary">
                              {v.working_sets}
                              {v.mev !== null && v.mrv !== null && (
                                <span className="opacity-60"> / {v.mev}–{v.mrv}</span>
                              )}
                            </span>
                          </div>

                          {/* BAR */}
                          <div className="relative h-5 rounded overflow-hidden" style={{ background: "var(--input-disabled-bg)" }}>

                            {/* MEV MARKER */}
                            {mevPosition !== null && (
                              <div
                                className="absolute top-0 bottom-0 w-px z-10 opacity-50"
                                style={{ left: `${mevPosition}%`, background: "var(--color-secondary)" }}
                              />
                            )}

                            {/* MRV MARKER */}
                            {mrvPosition !== null && (
                              <div
                                className="absolute top-0 bottom-0 w-px z-10 opacity-50"
                                style={{ left: `${mrvPosition}%`, background: "var(--alert-red-text)" }}
                              />
                            )}

                            {/* FILLED BAR */}
                            {v.working_sets > 0 && (
                              <div
                                className="absolute top-0 bottom-0 left-0 rounded transition-all duration-300"
                                style={{
                                  width: `${Math.min(barWidth, 100)}%`,
                                  background: getBarColor(v),
                                  opacity: 0.8,
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
