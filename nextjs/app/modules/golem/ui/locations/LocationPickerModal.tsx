"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import Modal from "@/components/Modal";
import { ChevronRight, Edit3, Loader2 } from "lucide-react";
import type { Location } from "../../types/location";

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;       // called after the active location changes
  // 'working' (default) sets the main/active location; 'warmup' sets the warmup location.
  target?: "working" | "warmup";
  zIndex?: number;
  // When the caller already has locations loaded (e.g. fetched on page mount), pass them here to
  // skip this modal's own fetch-on-open (avoids a loading flash every time the sheet is opened).
  // Falls back to fetching internally when omitted.
  preloadedLocations?: Location[];
}

export default function LocationPickerModal({
  isOpen,
  onClose,
  onChanged,
  target = "working",
  zIndex,
  preloadedLocations,
}: LocationPickerModalProps) {
  const router = useRouter();

  // DATA
  const [locations, setLocations] = useState<Location[]>(preloadedLocations ?? []);

  // STATE
  const [isLoading, setIsLoading] = useState(!preloadedLocations);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // STATE — derived per-target labels/selection so one sheet serves both pointers.
  const isWarmup = target === "warmup";
  const titleText = isWarmup ? "Warmup Location" : "Location";
  const isSelected = (loc: Location) => (isWarmup ? loc.is_warmup_active : loc.is_active);
  const noneSelected = !locations.some((l) => (isWarmup ? l.is_warmup_active : l.is_active));

  useEffect(() => {
    if (!isOpen) return;
    // Already have the data (preloaded by the caller) — use it, no fetch/spinner.
    if (preloadedLocations) {
      setLocations(preloadedLocations);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    fetch("/modules/golem/api/locations")
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: Location[]) => setLocations(data))
      .catch(() => toast.error("Failed to load locations"))
      .finally(() => setIsLoading(false));
  }, [isOpen, preloadedLocations]);

  const handlePick = async (loc: Location) => {
    setPendingId(loc.id);
    try {
      const resp = isWarmup
        ? await fetch(`/modules/golem/api/locations/warmup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locationId: loc.id }),
          })
        : await fetch(`/modules/golem/api/locations/${loc.id}/activate`, { method: "POST" });
      if (!resp.ok) throw new Error("set failed");
      onChanged();
      onClose();
    } catch (err) {
      console.error("Error setting location:", err);
      toast.error(`Failed to set ${isWarmup ? "warmup" : "active"} location`);
    } finally {
      setPendingId(null);
    }
  };

  // Clears the pointer. For working this deactivates; for warmup it falls back to the working location.
  const handleClear = async () => {
    setPendingId("__clear__");
    try {
      const resp = isWarmup
        ? await fetch(`/modules/golem/api/locations/warmup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ locationId: null }),
          })
        : await fetch(`/modules/golem/api/locations/deactivate`, { method: "POST" });
      if (!resp.ok) throw new Error("clear failed");
      onChanged();
      onClose();
    } catch (err) {
      console.error("Error clearing location:", err);
      toast.error("Failed to clear location");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      sheet
      zIndex={zIndex}
      title={<span className="block w-full text-center">{titleText}</span>}
      modalActions={<span aria-hidden className="w-0" />}
    >
      {/* LOADING */}
      {isLoading && (
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      )}

      {/* EMPTY */}
      {!isLoading && locations.length === 0 && (
        <p className="text-secondary text-center">
          You don't have any locations yet. Add one below.
        </p>
      )}

      {/* LIST */}
      {!isLoading && (
        <div className="flex flex-col gap-2">

          {/* SAME AS WORKOUT — warmup only; clears the warmup pointer */}
          {isWarmup && (
            <button
              type="button"
              className="option-card"
              aria-pressed={noneSelected}
              onClick={() => void handleClear()}
              disabled={pendingId !== null}
            >
              <div className="option-card-body">
                <div className="option-card-title">Same as workout</div>
                <div className="option-card-desc">Use the workout location for warmups</div>
              </div>
              {pendingId === "__clear__"
                ? <Loader2 className="w-4 h-4 animate-spin option-card-icon" />
                : <span className="option-card-radio" />}
            </button>
          )}

          {/* LOCATION ROWS */}
          {locations.map((loc) => (
            <div key={loc.id} className="option-card" aria-pressed={isSelected(loc)}>

              {/* SELECT AREA */}
              <button
                type="button"
                className="option-card-select"
                onClick={() => void handlePick(loc)}
                disabled={pendingId !== null}
              >
                <div className="option-card-body">
                  <div className="option-card-title">{loc.name}</div>
                  {loc.is_default && <div className="option-card-desc">Default</div>}
                </div>
              </button>

              {/* EDIT — jump to this location's equipment editor on the management page */}
              <button
                type="button"
                className="option-card-edit"
                aria-label={`Edit ${loc.name}`}
                onClick={() => {
                  onClose();
                  router.push(`/modules/golem/ui/locations?edit=${loc.id}`);
                }}
                disabled={pendingId !== null}
              >
                <Edit3 className="w-4 h-4" />
              </button>

              {pendingId === loc.id
                ? <Loader2 className="w-4 h-4 animate-spin option-card-icon" />
                : <span className="option-card-radio" />}
            </div>
          ))}

          {/* ADD NEW LOCATION — routes to the management page */}
          <button
            type="button"
            className="option-card"
            onClick={() => {
              onClose();
              router.push("/modules/golem/ui/locations");
            }}
            disabled={pendingId !== null}
          >
            <div className="option-card-body">
              <div className="option-card-title">Add New Location…</div>
            </div>
            <ChevronRight className="w-5 h-5 option-card-icon" />
          </button>
        </div>
      )}
    </Modal>
  );
}
