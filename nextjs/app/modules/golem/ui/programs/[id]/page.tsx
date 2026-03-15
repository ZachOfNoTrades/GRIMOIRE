"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Calendar, Circle, CircleCheck, CircleDot, Layers, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";
import { Program, getStatusLabel, getStatusBadge } from "../../../types/program";
import SessionTimer from "../../../components/SessionTimer";
import { formatDateShort } from "../../../utils/format";

export default function ProgramPage({ params }: { params: Promise<{ id: string }> }) {

  // DATA
  const [program, setProgram] = useState<Program | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [generatingWeekId, setGeneratingWeekId] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchProgram();
  }, []);

  const fetchProgram = async () => {
    setIsLoading(true);
    try {
      const { id } = await params;
      const response = await fetch(`/modules/golem/api/programs/${id}`);
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch program");
      }
      const data = await response.json();
      setProgram(data);
    } catch (error) {
      console.error("Error fetching program:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!program) return;
    setIsArchiving(true);
    try {
      const { id } = await params;
      const newArchived = !program.is_archived;
      const response = await fetch(`/modules/golem/api/programs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived: newArchived }),
      });
      if (!response.ok) {
        throw new Error("Failed to archive program");
      }
      if (newArchived) {
        // Navigate back since the program is now hidden
        router.push("/modules/golem/ui/home");
      } else {
        const data = await response.json();
        setProgram(data);
      }
    } catch (error) {
      console.error("Error archiving program:", error);
      toast.error("Failed to archive program");
    } finally {
      setIsArchiving(false);
    }
  };

  const generateNextWeek = async (weekId: string) => {
    setGeneratingWeekId(weekId);
    try {
      const { id } = await params;
      const response = await fetch(`/modules/golem/api/programs/${id}/weeks/${weekId}/generate`, { method: 'POST' });
      if (!response.ok) {
        throw new Error("Failed to generate next week");
      }
      await fetchProgram();
    } catch (error) {
      console.error("Error generating next week:", error);
    } finally {
      setGeneratingWeekId(null);
    }
  };

  if (isLoading) return (

    // LOADING PLACEHOLDER
    <div className="page">
      <main className="page-container">
        <div className="loading-container py-12">
          <div className="loading-spinner" />
        </div>
      </main>
    </div>
  );

  if (notFound || !program) return (

    // NOT FOUND PLACEHOLDER
    <div className="page">
      <main className="page-container">
        <p className="text-page-subtitle text-center py-8">Program not found</p>
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
            onClick={() => router.push("/modules/golem/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE ROW */}
          <div className="flex items-center justify-between">

            {/* TITLE AND BADGES */}
            <div className="flex items-center gap-3">

              {/* PROGRAM NAME */}
              <h1 className="text-page-title">{program.name}</h1>

              {/* PROGRAM STATUS BADGE */}
              <span className={getStatusBadge(program.is_current, program.is_completed)}>
                {getStatusLabel(program.is_current, program.is_completed)}
              </span>

              {/* ARCHIVED BADGE */}
              {program.is_archived && (
                <span className="badge-gray">Archived</span>
              )}
            </div>

            {/* ARCHIVE BUTTON */}
            <Button
              className="btn-off"
              onClick={handleArchive}
              disabled={isArchiving}
            >
              {program.is_archived ? (
                <ArchiveRestore className="w-4 h-4" />
              ) : (
                <Archive className="w-4 h-4" />
              )}
              {isArchiving ? "Saving..." : program.is_archived ? "Unarchive" : "Archive"}
            </Button>
          </div>

          {/* DESCRIPTION */}
          {program.description && (
            <p className="text-page-subtitle">{program.description}</p>
          )}
        </div>

        {/* BLOCKS */}
        <div className="card-container">

          {program.blocks.length === 0 ? (

            // EMPTY BLOCKS PLACEHOLDER
            <div className="card">
              <p className="text-secondary text-center py-4">No blocks in this program</p>
            </div>
          ) : (

            // BLOCKS LIST
            program.blocks.map((block, blockIndex) => (

              // BLOCK CARD
              <div key={block.id} className={`card ${block.is_current ? 'status-active' : ''}`}>

                {/* BLOCK HEADER */}
                <div className={`card-header ${block.is_completed ? 'status-completed' : ''}`}>

                  {/* BLOCK TITLE AND TAG */}
                  <div className="flex items-center gap-3">

                    {/* BLOCK NAME */}
                    <h2 className="text-card-title">
                      <Layers className="w-5 h-5" />
                      {block.name}
                    </h2>

                    {/* BLOCK TAG BADGE */}
                    {block.tag && (
                      <span
                        className="badge-gray"
                        style={block.color ? {
                          backgroundColor: block.color + '22',
                          borderColor: block.color + '55',
                          color: block.color,
                        } : undefined}
                      >
                        {block.tag}
                      </span>
                    )}
                  </div>
                </div>

                {/* BLOCK CONTENT */}
                <div className="card-content">

                  {/* BLOCK DESCRIPTION */}
                  {block.description && (
                    <p className="text-secondary">{block.description}</p>
                  )}

                  {block.weeks.length === 0 ? (

                    // EMPTY WEEKS PLACEHOLDER
                    <p className="text-secondary">No weeks in this block</p>
                  ) : (

                    // WEEKS LIST
                    block.weeks.map((week, weekIndex) => {

                      // Check if the previous week is completed (for showing generate button in empty weeks)
                      const previousWeek = weekIndex > 0
                        ? block.weeks[weekIndex - 1]
                        : blockIndex > 0
                          ? program.blocks[blockIndex - 1].weeks[program.blocks[blockIndex - 1].weeks.length - 1]
                          : null;
                      const canGenerate = week.sessions.length === 0 && !week.has_targets && !!previousWeek?.is_completed;
                      const canRegenerate = week.sessions.length > 0 && !week.sessions.some(s => s.started_at) && !!previousWeek?.is_completed;

                      return (

                        // WEEK SECTION
                        <div key={week.id} className={`flex flex-col gap-2 ${week.is_completed ? 'status-completed' : ''}`}>

                          {/* WEEK LABEL */}
                          <h3 className={`text-h2 ${week.is_current ? 'status-active-text' : ''}`}>
                            Week {week.week_number}
                            {week.name && (
                              <span className="text-secondary font-normal ml-2">— {week.name}</span>
                            )}
                          </h3>

                          {week.sessions.length === 0 ? (

                            canGenerate ? (

                              // GENERATE WEEK BUTTON
                              <Button
                                className="btn-blue"
                                disabled={generatingWeekId === previousWeek!.id}
                                onClick={() => generateNextWeek(previousWeek!.id)}
                              >
                                <Sparkles className="w-4 h-4" />
                                {generatingWeekId === previousWeek!.id ? "Generating..." : "Generate Week"}
                              </Button>
                            ) : (

                              // EMPTY SESSIONS PLACEHOLDER
                              <p className="text-secondary">No sessions this week</p>
                            )
                          ) : (

                            // SESSIONS LIST
                            week.sessions.map((session) => {
                              const timerStart = session.resumed_at ?? session.started_at;
                              const timerOffset = session.resumed_at ? (session.duration ?? 0) : 0;
                              const isInProgress = !!timerStart && !session.is_completed;

                              return (

                                // SESSION CARD
                                <div
                                  key={session.id}
                                  className={`sub-card cursor-pointer ${session.is_current && !session.is_completed ? 'status-active' : ''} ${session.is_completed ? 'status-completed' : ''}`}
                                  onClick={() => router.push(`/modules/golem/ui/session/${session.id}`)}
                                >

                                  {/* SESSION ROW */}
                                  <div className={`sub-card-header ${session.is_completed || !session.description ? '!mb-0' : ''}`}>

                                    {/* SESSION NAME */}
                                    <div className="flex items-center gap-2 min-w-0">

                                      {/* STATUS ICON */}
                                      {session.is_completed ? (
                                        <CircleCheck className="w-4 h-4 text-secondary" />
                                      ) : session.started_at ? (
                                        <CircleDot className="w-4 h-4 status-active-text" />
                                      ) : session.is_current ? (
                                        <Circle className="w-4 h-4 status-active-text" />
                                      ) : (
                                        <Circle className="w-4 h-4 text-secondary" />
                                      )}

                                      {/* NAME */}
                                      <span className="font-medium">{session.name}</span>

                                      {/* TIMER */}
                                      {isInProgress && (
                                        <SessionTimer startedAt={timerStart!} offsetSeconds={timerOffset} compact />
                                      )}
                                    </div>

                                    {/* DATE COMPLETED */}
                                    {session.started_at && (
                                      <div className="flex items-center gap-1 text-secondary whitespace-nowrap ml-3">

                                        {/* CALENDAR ICON */}
                                        <Calendar className="w-3.5 h-3.5 shrink-0" />

                                        {/* DATE */}
                                        <span className="text-sm">{formatDateShort(session.started_at)}</span>
                                      </div>
                                    )}
                                  </div>

                                  {/* SESSION DESCRIPTION */}
                                  {session.description && !session.is_completed && (
                                    <p className="text-secondary text-sm">{session.description}</p>
                                  )}
                                </div>
                              );
                            })
                          )}

                          {/* REGENERATE WEEK BUTTON (appears when sessions exist but none have been started) */}
                          {canRegenerate && (
                            <Button
                              className="btn-link"
                              disabled={generatingWeekId === previousWeek!.id}
                              onClick={() => generateNextWeek(previousWeek!.id)}
                            >
                              <RefreshCw className="w-4 h-4" />
                              {generatingWeekId === previousWeek!.id ? "Regenerating..." : "Regenerate Week"}
                            </Button>
                          )}

                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

    </div>
  );
}
