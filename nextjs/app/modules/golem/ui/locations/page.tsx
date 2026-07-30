"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGoBack } from "@/lib/useGoBack";
import toast, { Toaster } from "react-hot-toast";
import { ArrowLeft, MapPin, Plus, Trash2, Edit3, Check, Dumbbell, Star, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/lib/useConfirm";
import { usePrompt } from "@/lib/usePrompt";
import type {
  Equipment,
  EquipmentOption,
  Location,
  LocationWithEquipment,
} from "../../types/location";
import LocationEquipmentModal from "./LocationEquipmentModal";

export default function GolemLocationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const goBack = useGoBack();
  const { confirm, confirmModal } = useConfirm();
  const { prompt, promptModal } = usePrompt();

  // DATA
  const [locations, setLocations] = useState<Location[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [options, setOptions] = useState<EquipmentOption[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [editingLocation, setEditingLocation] = useState<LocationWithEquipment | null>(null);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // INITIAL LOAD
  useEffect(() => {
    void loadAll();
  }, []);

  // Deep link from the location picker popup (?edit=<locationId>) — open that location's
  // equipment editor immediately, then strip the param so a refresh doesn't reopen it.
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    void openEditor(editId);
    router.replace("/modules/golem/ui/locations", { scroll: false });
  }, [searchParams]);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [locResp, eqResp] = await Promise.all([
        fetch("/modules/golem/api/locations"),
        fetch("/modules/golem/api/equipment"),
      ]);
      if (!locResp.ok) throw new Error("Failed to load locations");
      if (!eqResp.ok) throw new Error("Failed to load equipment");
      const locs: Location[] = await locResp.json();
      const eq: { equipment: Equipment[]; options: EquipmentOption[] } = await eqResp.json();
      setLocations(locs);
      setEquipment(eq.equipment);
      setOptions(eq.options);
    } catch (err) {
      console.error("Error loading locations page:", err);
      toast.error("Failed to load locations");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreate() {
    const raw = await prompt({
      title: "New Location",
      message: "Name this location (e.g. Home gym, Office, Travel)",
      placeholder: "Location name",
      confirmLabel: "Create",
    });
    if (!raw) return;
    const name = raw.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const resp = await fetch("/modules/golem/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (resp.status === 409) {
        toast.error("A location with that name already exists");
        return;
      }
      if (!resp.ok) throw new Error("create failed");
      const created: Location = await resp.json();
      // Immediately open the equipment editor on the new location.
      await openEditor(created.id);
      await loadAll();
    } catch (err) {
      console.error("Error creating location:", err);
      toast.error("Failed to create location");
    } finally {
      setIsCreating(false);
    }
  }

  async function openEditor(locationId: string) {
    try {
      const resp = await fetch(`/modules/golem/api/locations/${locationId}`);
      if (!resp.ok) throw new Error("load failed");
      const loc: LocationWithEquipment = await resp.json();
      setEditingLocation(loc);
    } catch (err) {
      console.error("Error opening location editor:", err);
      toast.error("Failed to open location");
    }
  }

  async function handleActivate(loc: Location) {
    try {
      const resp = await fetch(`/modules/golem/api/locations/${loc.id}/activate`, {
        method: "POST",
      });
      if (!resp.ok) throw new Error("activate failed");
      await loadAll();
    } catch (err) {
      console.error("Error activating location:", err);
      toast.error("Failed to activate location");
    }
  }

  async function handleMakeDefault(loc: Location) {
    try {
      const resp = await fetch(`/modules/golem/api/locations/${loc.id}/default`, {
        method: "POST",
      });
      if (!resp.ok) throw new Error("set default failed");
      await loadAll();
    } catch (err) {
      console.error("Error setting default location:", err);
      toast.error("Failed to set default location");
    }
  }

  async function handleToggleBodyweight(loc: Location) {
    try {
      const resp = await fetch(`/modules/golem/api/locations/${loc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyweight_only: !loc.bodyweight_only }),
      });
      if (!resp.ok) throw new Error("toggle failed");
      await loadAll();
    } catch (err) {
      console.error("Error toggling bodyweight-only:", err);
      toast.error("Failed to update bodyweight-only mode");
    }
  }

  async function handleToggleWarmup(loc: Location) {
    try {
      const resp = await fetch(`/modules/golem/api/locations/warmup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: loc.is_warmup_active ? null : loc.id }),
      });
      if (!resp.ok) throw new Error("warmup toggle failed");
      await loadAll();
    } catch (err) {
      console.error("Error toggling warmup location:", err);
      toast.error("Failed to update warmup location");
    }
  }

  async function handleRenameCommit() {
    if (!renameTargetId) return;
    const name = renameDraft.trim();
    if (!name) {
      setRenameTargetId(null);
      return;
    }
    try {
      const resp = await fetch(`/modules/golem/api/locations/${renameTargetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (resp.status === 409) {
        toast.error("A location with that name already exists");
        return;
      }
      if (!resp.ok) throw new Error("rename failed");
      setRenameTargetId(null);
      await loadAll();
    } catch (err) {
      console.error("Error renaming location:", err);
      toast.error("Failed to rename location");
    }
  }

  async function handleDelete(loc: Location) {
    const confirmed = await confirm({
      title: "Delete Location",
      message: (
        <>
          Delete location <strong>{loc.name}</strong>? This cannot be undone.
        </>
      ),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!confirmed) return;
    try {
      const resp = await fetch(`/modules/golem/api/locations/${loc.id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error("delete failed");
      await loadAll();
    } catch (err) {
      console.error("Error deleting location:", err);
      toast.error("Failed to delete location");
    }
  }

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* HEADER */}
        <div className="mb-6">

          {/* BACK */}
          <Button
            onClick={() => goBack("/modules/golem/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* TITLE */}
          <h1 className="text-page-title">
            <MapPin className="w-6 h-6" />
            Locations
          </h1>
        </div>

        {/* NEW LOCATION BUTTON */}
        <div className="mb-4">
          <Button
            onClick={handleCreate}
            disabled={isCreating}
            className="btn-blue"
          >
            <Plus className="w-4 h-4" />
            <span>{isCreating ? "Creating..." : "New Location"}</span>
          </Button>
        </div>

        {/* LOADING */}
        {isLoading && (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        )}

        {/* EMPTY */}
        {!isLoading && locations.length === 0 && (
          <div className="sub-card">
            <div className="sub-card-content">
              <p className="text-secondary">
                No locations yet. Create one for each gym / setup you train at, and pick which
                equipment is available there.
              </p>
            </div>
          </div>
        )}

        {/* LOCATION LIST */}
        {!isLoading && locations.length > 0 && (
          <div className="flex flex-col gap-3">
            {locations.map((loc) => (
              /* LOCATION SUB-CARD */
              <div key={loc.id} className={`sub-card ${loc.is_active ? "is-active" : ""}`}>

                {/* HEADER */}
                <div className="sub-card-header">

                  {/* NAME (or rename input) */}
                  {renameTargetId === loc.id ? (
                    <input
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={handleRenameCommit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameCommit();
                        if (e.key === "Escape") setRenameTargetId(null);
                      }}
                      autoFocus
                      className="input-field"
                    />
                  ) : (
                    <h3 className="text-card-title flex items-center gap-2 flex-wrap">
                      {loc.name}
                      {loc.is_active && (
                        <span className="badge-blue inline-flex items-center gap-1">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      )}
                      {loc.is_default && (
                        <span className="badge-gray inline-flex items-center gap-1">
                          <Star className="w-3 h-3" /> Default
                        </span>
                      )}
                      {loc.is_warmup_active && (
                        <span className="badge-blue inline-flex items-center gap-1">
                          <Flame className="w-3 h-3" /> Warmup
                        </span>
                      )}
                      {loc.bodyweight_only && (
                        <span className="badge-gray inline-flex items-center gap-1">
                          <Dumbbell className="w-3 h-3" /> Bodyweight only
                        </span>
                      )}
                    </h3>
                  )}
                </div>

                {/* ACTIONS */}
                <div className="sub-card-content flex flex-wrap items-center gap-2">

                  {/* ENABLED EXERCISES */}
                  <Button
                    onClick={() => router.push(`/modules/golem/ui/exercises?location=${loc.id}`)}
                    className="btn-blue"
                  >
                    <Dumbbell className="w-4 h-4" />
                    <span>Enabled Exercises</span>
                  </Button>

                  {/* EDIT EQUIPMENT — bodyweight-only locations ignore equipment */}
                  {!loc.bodyweight_only && (
                    <Button
                      onClick={() => void openEditor(loc.id)}
                      className="btn-off"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>Edit Equipment</span>
                    </Button>
                  )}

                  {/* BODYWEIGHT-ONLY TOGGLE */}
                  <Button
                    onClick={() => void handleToggleBodyweight(loc)}
                    className={loc.bodyweight_only ? "btn-blue" : "btn-off"}
                  >
                    {loc.bodyweight_only ? "Bodyweight Only: On" : "Bodyweight Only: Off"}
                  </Button>

                  {/* MAKE ACTIVE */}
                  {!loc.is_active && (
                    <Button
                      onClick={() => void handleActivate(loc)}
                      className="btn-off"
                    >
                      Make Active
                    </Button>
                  )}

                  {/* WARMUP LOCATION TOGGLE — source warmups from here */}
                  <Button
                    onClick={() => void handleToggleWarmup(loc)}
                    className="btn-link"
                  >
                    <Flame className="w-4 h-4" />
                    <span>{loc.is_warmup_active ? "Clear Warmups" : "Use for Warmups"}</span>
                  </Button>

                  {/* MAKE DEFAULT */}
                  {!loc.is_default && (
                    <Button
                      onClick={() => void handleMakeDefault(loc)}
                      className="btn-link"
                    >
                      Make Default
                    </Button>
                  )}

                  {/* RENAME */}
                  <Button
                    onClick={() => {
                      setRenameDraft(loc.name);
                      setRenameTargetId(loc.id);
                    }}
                    className="btn-link"
                  >
                    Rename
                  </Button>

                  {/* DELETE — the default location cannot be deleted */}
                  {!loc.is_default && (
                    <Button
                      onClick={() => void handleDelete(loc)}
                      className="btn-link"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOAST */}
      <Toaster position="top-center" />

      {/* EQUIPMENT MODAL */}
      <LocationEquipmentModal
        isOpen={editingLocation !== null}
        onClose={() => setEditingLocation(null)}
        location={editingLocation}
        equipment={equipment}
        options={options}
        onSaved={() => {
          void loadAll();
        }}
      />

      {/* NEW-LOCATION PROMPT MODAL */}
      {promptModal}

      {/* DELETE-LOCATION CONFIRM MODAL */}
      {confirmModal}
    </div>
  );
}
