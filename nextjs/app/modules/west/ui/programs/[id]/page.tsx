"use client"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Dumbbell, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Program } from "../../../types/program";

export default function ProgramPage({ params }: { params: Promise<{ id: string }> }) {

  // DATA
  const [program, setProgram] = useState<Program | null>(null);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const router = useRouter();

  useEffect(() => {
    fetchProgram();
  }, []);

  const fetchProgram = async () => {
    setIsLoading(true);
    try {
      const { id } = await params;
      const response = await fetch(`/modules/west/api/programs/${id}`);
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

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoading) return (

    // LOADING PLACEHOLDER
    <div className="page">
      <main className="page-container">
        <p className="text-page-subtitle text-center py-8">Loading program...</p>
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
            onClick={() => router.back()}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">{program.name}</h1>

            {/* DESCRIPTION */}
            {program.description && (
              <p className="text-page-subtitle">{program.description}</p>
            )}
          </div>
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
            program.blocks.map((block) => (

              // BLOCK CARD
              <div key={block.id} className="card">

                {/* BLOCK HEADER */}
                <div className="card-header">

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
                        className="badge-muted"
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
                    block.weeks.map((week) => (

                      // WEEK SECTION
                      <div key={week.id} className="flex flex-col gap-2">

                        {/* WEEK LABEL */}
                        <h3 className="text-h2">
                          Week {week.week_number}
                          {week.name && (
                            <span className="text-secondary font-normal ml-2">— {week.name}</span>
                          )}
                        </h3>

                        {week.sessions.length === 0 ? (

                          // EMPTY SESSIONS PLACEHOLDER
                          <p className="text-secondary">No sessions this week</p>
                        ) : (

                          // SESSIONS LIST
                          week.sessions.map((session) => (

                            // SESSION CARD
                            <div
                              key={session.id}
                              className="sub-card cursor-pointer"
                              onClick={() => router.push(`/modules/west/ui/session/${session.id}`)}
                            >

                              {/* SESSION ROW */}
                              <div className="sub-card-header">

                                {/* SESSION NAME */}
                                <div className="flex items-center gap-2">

                                  {/* SESSION ICON */}
                                  <Dumbbell className="w-4 h-4 text-secondary" />

                                  {/* NAME */}
                                  <span className="font-medium">{session.name}</span>
                                </div>

                                {/* SESSION DATE */}
                                <div className="flex items-center gap-1 text-secondary">

                                  {/* CALENDAR ICON */}
                                  <Calendar className="w-3.5 h-3.5" />

                                  {/* DATE */}
                                  <span className="text-sm">{formatDate(session.session_date)}</span>
                                </div>
                              </div>

                              {/* SESSION NOTES */}
                              {session.notes && (
                                <p className="text-secondary text-sm">{session.notes}</p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    ))
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
