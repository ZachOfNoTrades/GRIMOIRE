"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Dumbbell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Exercise } from "../../types/exercise";
import PaginatedTable, { PaginatedTableHandle } from "../../components/PaginatedTable";
import AddExerciseModal from "./AddExerciseModal";

export default function ExercisesPage() {

  // INPUT
  const [searchTerm, setSearchTerm] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);

  // STATE
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const tableRef = useRef<PaginatedTableHandle>(null);
  const router = useRouter();

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

          {/* TITLE/SUBTITLE */}
          <div>
            <h1 className="text-page-title">Exercise Library</h1>
          </div>
        </div>

        {/* EXERCISES CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <h2 className="text-card-title">
              <Dumbbell className="w-5 h-5" />
              Exercises
            </h2>

            {/* ACTIONS */}
            <div className="flex items-center gap-2">

              {/* SEARCH BAR */}
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field"
              />

              {/* ADD BUTTON */}
              <Button
                onClick={() => setIsAddModalOpen(true)}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </Button>
            </div>
          </div>

          {/* STATUS FILTER TABS */}
          <div className="flex gap-0 border-b border-[var(--card-border)]">

            {/* ENABLED TAB */}
            <button
              onClick={() => setShowDisabled(false)}
              className={`tab-button ${!showDisabled ? "tab-button-active" : ""}`}
            >
              Enabled
            </button>

            {/* DISABLED TAB */}
            <button
              onClick={() => setShowDisabled(true)}
              className={`tab-button ${showDisabled ? "tab-button-active" : ""}`}
            >
              Disabled
            </button>
          </div>

          {/* EXERCISES TABLE */}
          <PaginatedTable<Exercise>
            key={`${showDisabled}-${debouncedSearch}`}
            ref={tableRef}
            fetchUrl={(page, pageSize) =>
              `/modules/golem/api/exercises?showDisabled=${showDisabled}&search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${pageSize}`
            }
            dataKey="exercises"
            columns={[{ header: "Exercise" }]}
            defaultPageSize={0}
            emptyMessage={debouncedSearch ? "No exercises match search criteria" : "No exercises found"}
            renderRow={(exercise) => (

              // TABLE ROW
              <tr
                key={exercise.id}
                className="table-row-clickable"
                onClick={() => router.push(`/modules/golem/ui/exercises/${exercise.id}`)}
              >
                <td className="table-cell">{exercise.name}</td>
              </tr>
            )}
          />
        </div>

        {/* ADD EXERCISE MODAL */}
        <AddExerciseModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSaved={() => tableRef.current?.refresh()}
        />
      </main>
    </div>
  );
}
