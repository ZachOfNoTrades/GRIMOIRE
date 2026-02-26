"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, LayoutList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../types/workoutSession";
import { ProgramSummary, PROGRAM_STATUS_LABELS, PROGRAM_STATUS_BADGE } from "../../types/program";

export default function HistoryPage() {

  // DATA
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  // INPUT
  const [searchTerm, setSearchTerm] = useState("");

  // STATE
  const [isProgramsLoading, setIsProgramsLoading] = useState(true);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);

  const standaloneSessions = sessions.filter((s) => s.week_id === null);
  const filteredSessions = standaloneSessions.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const router = useRouter();

  useEffect(() => {
    fetchPrograms();
    fetchSessions();
  }, []);

  const fetchPrograms = async () => {
    setIsProgramsLoading(true);
    try {
      const response = await fetch("/modules/west/api/programs");
      if (!response.ok) {
        throw new Error("Failed to fetch programs");
      }
      const data = await response.json();
      setPrograms(data);
    } catch (error) {
      console.error("Error fetching programs:", error);
    } finally {
      setIsProgramsLoading(false);
    }
  };

  const fetchSessions = async () => {
    setIsSessionsLoading(true);
    try {
      const response = await fetch("/modules/west/api/sessions");
      if (!response.ok) {
        throw new Error("Failed to fetch sessions");
      }
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      console.error("Error fetching sessions:", error);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (

    // BACKGROUND
    <div className="page">

      <main className="page-container">

        {/* HEADER */}
        <div className="mb-8">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/modules/west/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <div>
            <h1 className="text-page-title">Workout History</h1>
          </div>
        </div>

        <div className="card-container">

          {/* PROGRAMS CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">
                <LayoutList className="w-5 h-5" />
                Programs
              </h2>
            </div>

            {/* TABLE */}
            {isProgramsLoading ? (

              // LOADING PLACEHOLDER
              <p className="text-page-subtitle text-center py-8">Loading programs...</p>
            ) : (

              // CONTENT
              <div className="table-container">
                <table className="table">

                  {/* TABLE HEADERS */}
                  <thead className="table-header">
                    <tr className="table-header-row">
                      <th className="table-header-cell">Name</th>
                      <th className="table-header-cell">Status</th>
                    </tr>
                  </thead>

                  {/* TABLE ROWS */}
                  <tbody className="table-body">

                    {programs.length === 0 ? (

                      // EMPTY PLACEHOLDER
                      <tr>
                        <td colSpan={2} className="table-empty">No programs found</td>
                      </tr>
                    ) : (

                      // RECORDS MAP
                      programs.map((program) => (

                        // TABLE ROW
                        <tr
                          key={program.id}
                          className="table-row-clickable"
                          onClick={() => router.push(`/modules/west/ui/programs/${program.id}`)}
                        >
                          <td className="table-cell">{program.name}</td>
                          <td className="table-cell">
                            <span className={PROGRAM_STATUS_BADGE[program.status] ?? "badge-muted"}>
                              {PROGRAM_STATUS_LABELS[program.status] ?? "Unknown"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* STANDALONE SESSIONS CARD */}
          <div className="card">

            {/* CARD HEADER */}
            <div className="card-header">

              {/* TITLE */}
              <h2 className="text-card-title">
                <History className="w-5 h-5" />
                Sessions
              </h2>

              {/* SEARCH BAR */}
              <div>
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            {/* TABLE */}
            {isSessionsLoading ? (

              // LOADING PLACEHOLDER
              <p className="text-page-subtitle text-center py-8">Loading sessions...</p>
            ) : (

              // CONTENT
              <div className="table-container max-h-[calc(100vh-28rem)]">
                <table className="table">

                  {/* TABLE HEADERS */}
                  <thead className="table-header">
                    <tr className="table-header-row">
                      <th className="table-header-cell">Name</th>
                      <th className="table-header-cell">Date</th>
                    </tr>
                  </thead>

                  {/* TABLE ROWS */}
                  <tbody className="table-body">

                    {standaloneSessions.length === 0 ? (

                      // EMPTY PLACEHOLDER
                      <tr>
                        <td colSpan={2} className="table-empty">No standalone sessions found</td>
                      </tr>
                    ) : filteredSessions.length === 0 ? (

                      // NO SEARCH RESULTS PLACEHOLDER
                      <tr>
                        <td colSpan={2} className="table-empty">No sessions match search criteria</td>
                      </tr>
                    ) : (

                      // RECORDS MAP
                      filteredSessions.map((session) => (

                        // TABLE ROW
                        <tr
                          key={session.id}
                          className="table-row-clickable"
                          onClick={() => router.push(`/modules/west/ui/session/${session.id}`)}
                        >
                          <td className="table-cell">{session.name}</td>
                          <td className="table-cell">{formatDate(session.session_date)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* SUMMARY */}
            {!isSessionsLoading && filteredSessions.length > 0 && (
              <div className="text-secondary text-center mt-4">
                Showing {filteredSessions.length} of {standaloneSessions.length} sessions
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
