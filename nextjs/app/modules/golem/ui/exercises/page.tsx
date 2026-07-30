"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
import { ArrowLeft, Dumbbell, Plus, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Exercise } from "../../types/exercise";
import { Location } from "../../types/location";
import PaginatedTable, { PaginatedTableHandle } from "../../components/PaginatedTable";
import AddExerciseModal from "./AddExerciseModal";

export default function ExercisesPage() {

  // DATA
  const [locations, setLocations] = useState<Location[]>([]);

  // INPUT
  const [searchTerm, setSearchTerm] = useState("");
  const [showDisabled, setShowDisabled] = useState(false);
  // Which location's enabled list we are editing. Empty until locations load.
  const [selectedLocationId, setSelectedLocationId] = useState("");

  // STATE
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const tableRef = useRef<PaginatedTableHandle>(null);
  const router = useRouter();
  const goBack = useGoBack();

  // Load locations and pick the initial one: URL ?location= param, else active, else default, else first.
  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch("/modules/golem/api/locations");
        if (!resp.ok) throw new Error("Failed to load locations");
        const locs: Location[] = await resp.json();
        setLocations(locs);

        const urlLocation = new URLSearchParams(window.location.search).get("location");
        const initial =
          (urlLocation && locs.find((l) => l.id === urlLocation)?.id) ||
          locs.find((l) => l.is_active)?.id ||
          locs.find((l) => l.is_default)?.id ||
          locs[0]?.id ||
          "";
        setSelectedLocationId(initial);
      } catch (error) {
        console.error("Error loading locations:", error);
      }
    })();
  }, []);

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
            onClick={() => goBack("/modules/golem/ui/home")}
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

              {/* LOCATION SELECTOR — enabled exercises are per-location */}
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4 text-secondary" />
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="input-field"
                  aria-label="Location"
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.is_active ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </div>

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
                className="btn-blue"
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

          {/* EXERCISES TABLE — waits for a resolved location so the per-location list is correct */}
          {selectedLocationId && (
            <PaginatedTable<Exercise>
              key={`${selectedLocationId}-${showDisabled}-${debouncedSearch}`}
              ref={tableRef}
              fetchUrl={(page, pageSize) =>
                `/modules/golem/api/exercises?location=${selectedLocationId}&showDisabled=${showDisabled}&search=${encodeURIComponent(debouncedSearch)}&page=${page}&pageSize=${pageSize}`
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
                  onClick={() => router.push(`/modules/golem/ui/exercises/${exercise.id}?location=${selectedLocationId}`)}
                >
                  <td className="table-cell">{exercise.name}</td>
                </tr>
              )}
            />
          )}
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
