"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../types/workoutSession";

export default function HistoryPage() {

  // DATA
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  // INPUT
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredSessions, setFilteredSessions] = useState<WorkoutSession[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchSessions();
  }, []);

  // UPDATE SEARCH FILTER
  useEffect(() => {
    filterSessions();
  }, [sessions, searchTerm]);

  const fetchSessions = async () => {
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  const filterSessions = () => {
    let filtered = [...sessions];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((session) =>
        session.name.toLowerCase().includes(term)
      );
    }

    setFilteredSessions(filtered);
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
            onClick={() => router.back()}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE/SUBTITLE */}
          <div>
            <h1 className="text-page-title">Workout History</h1>
          </div>
        </div>

        {/* SESSIONS CARD */}
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
          {isLoading ? (

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

                  {sessions.length === 0 ? (

                    // NO RECORDS FOUND WARNING
                    <tr>
                      <td colSpan={2} className="table-empty">No sessions found</td>
                    </tr>
                  ) : filteredSessions.length === 0 ? (

                    // NO SEARCH RESULTS FOUND WARNING
                    <tr>
                      <td colSpan={2} className="table-empty">No sessions match search criteria</td>
                    </tr>
                  ) : (

                    // RECORDS MAP
                    filteredSessions.map((session) => (

                      // TABLE ROW
                      <tr key={session.id} className="table-row">
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
          {!isLoading && filteredSessions.length > 0 && (
            <div className="text-secondary text-center mt-4">
              Showing {filteredSessions.length} of {sessions.length} sessions
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
