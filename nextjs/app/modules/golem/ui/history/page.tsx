"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, LayoutList, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkoutSession } from "../../types/workoutSession";
import { ProgramSummary } from "../../types/program";
import { formatDateTimeShort } from "../../utils/format";
import PaginatedTable, { PaginatedTableHandle } from "../../components/PaginatedTable";
import ImportHistoryModal from "./ImportHistoryModal";

export default function HistoryPage() {

  // STATE
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const sessionsTableRef = useRef<PaginatedTableHandle>(null);
  const router = useRouter();


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

            {/* TITLE */}
            <h1 className="text-page-title">Workout History</h1>

            {/* IMPORT BUTTON */}
            <Button
              onClick={() => setIsImportModalOpen(true)}
              className="btn-secondary"
            >
              <Upload className="w-4 h-4" />
              <span>Import History</span>
            </Button>
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

            {/* PAGINATED PROGRAMS TABLE */}
            <PaginatedTable<ProgramSummary>
              fetchUrl={(page, pageSize) => `/modules/golem/api/programs?page=${page}&pageSize=${pageSize}`}
              dataKey="programs"
              columns={[
                { header: "", headerClassName: "!px-0" },
                { header: "Name" },
                { header: "Date" },
              ]}
              renderRow={(program) => (

                // TABLE ROW
                <tr
                  key={program.id}
                  className="table-row-clickable"
                  onClick={() => router.push(`/modules/golem/ui/programs/${program.id}`)}
                >
                  <td className="table-cell !pl-5 !pr-0 text-center">{program.is_current && <div className="dot-blue inline-block" />}</td>
                  <td className="table-cell w-full truncate max-w-0">{program.name}</td>
                  <td className="table-cell">{new Date(program.created_at).toISOString().slice(0, 7)}</td>
                </tr>
              )}
              emptyMessage="No programs found"
            />
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
            </div>

            {/* PAGINATED SESSIONS TABLE */}
            <PaginatedTable<WorkoutSession>
              ref={sessionsTableRef}
              fetchUrl={(page, pageSize) => `/modules/golem/api/sessions?page=${page}&pageSize=${pageSize}`}
              dataKey="sessions"
              columns={[
                { header: "Name" },
                { header: "Created" },
              ]}
              renderRow={(session) => (

                // TABLE ROW
                <tr
                  key={session.id}
                  className="table-row-clickable"
                  onClick={() => router.push(`/modules/golem/ui/session/${session.id}`)}
                >
                  <td className="table-cell">{session.name}</td>
                  <td className="table-cell">{formatDateTimeShort(session.created_at)}</td>
                </tr>
              )}
              emptyMessage="No standalone sessions found"
            />
          </div>
        </div>
      </main>

      {/* IMPORT HISTORY MODAL */}
      <ImportHistoryModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImported={() => sessionsTableRef.current?.refresh()}
      />
    </div>
  );
}
