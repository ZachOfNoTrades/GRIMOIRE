"use client";

import { useState, useEffect } from "react";
import { BackLink } from "@/components/BackLink";
import { ArrowLeft, User, Pencil } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { SettingsToggleRow } from "@/components/settings/SettingsList";
import { UserProfile } from "../../types/userProfile";
import { DEFAULT_SHORT_UNIT, DEFAULT_LONG_UNIT } from "../../utils/units";

interface CalculatedLandmark {
  muscle_group_name: string;
  mev: number;
  mrv: number;
}

export default function ProfilePage() {

  // DATA
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [landmarks, setLandmarks] = useState<CalculatedLandmark[]>([]);

  // INPUT
  const [editedProfilePrompt, setEditedProfilePrompt] = useState("");
  const [distanceUnitShort, setDistanceUnitShort] = useState<string>(DEFAULT_SHORT_UNIT);
  const [distanceUnitLong, setDistanceUnitLong] = useState<string>(DEFAULT_LONG_UNIT);
  const [restTimerEnabled, setRestTimerEnabled] = useState(true);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingUnits, setIsSavingUnits] = useState(false);
  const [isSavingRestTimer, setIsSavingRestTimer] = useState(false);


  // LOAD DATA
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const [profileResponse, landmarksResponse] = await Promise.all([
        fetch("/modules/golem/api/user-profile"),
        fetch("/modules/golem/api/volume/landmarks"),
      ]);

      if (profileResponse.ok) {
        const data = await profileResponse.json();
        setProfile(data);
        setDistanceUnitShort(data.distance_unit_short ?? DEFAULT_SHORT_UNIT);
        setDistanceUnitLong(data.distance_unit_long ?? DEFAULT_LONG_UNIT);
        setRestTimerEnabled(data.rest_timer_enabled ?? true);
      }

      if (landmarksResponse.ok) {
        const data = await landmarksResponse.json();
        setLandmarks(data);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // EDIT HANDLERS
  const handleStartEdit = () => {
    if (!profile) return;
    setEditedProfilePrompt(profile.profile_prompt || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/modules/golem/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_prompt: editedProfilePrompt.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.error || "Failed to update profile");
        return;
      }

      const updatedProfile = await response.json();
      setProfile(updatedProfile);
      setIsEditing(false);
      toast.success("Profile saved");
    } catch (error) {
      toast.error("Failed to update profile");
      console.error("Error saving profile:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Persist a distance-unit change immediately (auto-save on select). Optimistically applies the new value
  // and reverts on failure.
  const handleDistanceUnitChange = async (band: "short" | "long", value: string) => {
    const prevShort = distanceUnitShort;
    const prevLong = distanceUnitLong;
    if (band === "short") setDistanceUnitShort(value);
    else setDistanceUnitLong(value);

    setIsSavingUnits(true);
    try {
      const response = await fetch("/modules/golem/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          band === "short" ? { distance_unit_short: value } : { distance_unit_long: value }
        ),
      });

      if (!response.ok) {
        throw new Error("Failed to update distance units");
      }

      const updatedProfile = await response.json();
      setProfile(updatedProfile);
      toast.success("Distance units saved");
    } catch (error) {
      // Revert on failure
      setDistanceUnitShort(prevShort);
      setDistanceUnitLong(prevLong);
      toast.error("Failed to update distance units");
      console.error("Error saving distance units:", error);
    } finally {
      setIsSavingUnits(false);
    }
  };

  // Persist the rest-timer toggle immediately. Optimistically applies the new value and reverts on failure.
  const handleRestTimerEnabledChange = async (next: boolean) => {
    const previous = restTimerEnabled;
    setRestTimerEnabled(next);

    setIsSavingRestTimer(true);
    try {
      const response = await fetch("/modules/golem/api/user-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rest_timer_enabled: next }),
      });

      if (!response.ok) {
        throw new Error("Failed to update rest timer setting");
      }

      const updatedProfile = await response.json();
      setProfile(updatedProfile);
      toast.success(next ? "Rest timer enabled" : "Rest timer disabled");
    } catch (error) {
      // Revert on failure
      setRestTimerEnabled(previous);
      toast.error("Failed to update rest timer setting");
      console.error("Error saving rest timer setting:", error);
    } finally {
      setIsSavingRestTimer(false);
    }
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

      <Toaster />

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
            <User className="w-8 h-8" />
            User Profile
          </h1>
        </div>

        {/* PROFILE CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <h2 className="text-card-title">
              LLM Context
            </h2>

            {/* ACTIONS */}
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  {/* CANCEL BUTTON */}
                  <Button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="btn-link"
                  >
                    Cancel
                  </Button>

                  {/* SAVE BUTTON */}
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="btn-blue"
                  >
                    {isSaving ? "Saving..." : "Save"}
                  </Button>
                </>
              ) : (

                // EDIT BUTTON
                <Button
                  onClick={handleStartEdit}
                  className="btn-link"
                >
                  <Pencil className="w-4 h-4" />
                  <span>Edit</span>
                </Button>
              )}
            </div>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">
            {isEditing ? (

              // PROFILE PROMPT TEXTAREA (EDIT MODE)
              <textarea
                value={editedProfilePrompt}
                onChange={(e) => setEditedProfilePrompt(e.target.value)}
                className="input-field font-mono text-sm min-h-[400px] resize-y"
                placeholder="Enter personal context for LLM generation (anatomy, injuries, experience level, goals, etc.)..."
              />
            ) : (

              // PROFILE PROMPT DISPLAY (VIEW MODE)
              profile?.profile_prompt ? (
                <pre className="text-primary text-sm font-mono whitespace-pre-wrap break-words">
                  {profile.profile_prompt}
                </pre>
              ) : (
                <p className="text-secondary text-center py-8">No profile context configured</p>
              )
            )}
          </div>
        </div>

        {/* DISTANCE UNITS CARD */}
        <div className="card mt-6">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <div>
              <h2 className="text-card-title">Distance Units</h2>
              <p className="text-secondary text-sm">Preferred display units for distance-tracking exercises (values are stored in meters and converted for display)</p>
            </div>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content flex flex-col gap-4">

            {/* SHORT DISTANCE UNIT */}
            <div className="flex flex-col gap-1">
              <label className="text-label">Short distance</label>
              <select
                value={distanceUnitShort}
                onChange={(e) => handleDistanceUnitChange("short", e.target.value)}
                disabled={isSavingUnits}
                className="input-field !w-auto"
              >
                <option value="meters">Meters (m)</option>
                <option value="yards">Yards (yd)</option>
                <option value="feet">Feet (ft)</option>
              </select>
            </div>

            {/* LONG DISTANCE UNIT */}
            <div className="flex flex-col gap-1">
              <label className="text-label">Long distance</label>
              <select
                value={distanceUnitLong}
                onChange={(e) => handleDistanceUnitChange("long", e.target.value)}
                disabled={isSavingUnits}
                className="input-field !w-auto"
              >
                <option value="km">Kilometers (km)</option>
                <option value="mi">Miles (mi)</option>
              </select>
            </div>
          </div>
        </div>

        {/* REST TIMER CARD */}
        <div className="card mt-6">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <div>
              <h2 className="text-card-title">Rest Timer</h2>
              <p className="text-secondary text-sm">Countdown shown after each working set is marked complete</p>
            </div>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* TOGGLE GROUP */}
            <div className="settings-group">
              <SettingsToggleRow
                label="Show rest timer"
                hint="Vibrates when the rest period elapses"
                checked={restTimerEnabled}
                disabled={isSavingRestTimer}
                onChange={handleRestTimerEnabledChange}
              />
            </div>
          </div>
        </div>

        {/* VOLUME LANDMARKS CARD */}
        <div className="card mt-6">

          {/* CARD HEADER */}
          <div className="card-header">

            {/* TITLE */}
            <div>
              <h2 className="text-card-title">Volume Landmarks</h2>
              <p className="text-secondary text-sm">Working sets per muscle group per week, derived from your last 8 completed weeks</p>
            </div>
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">
            {landmarks.length === 0 ? (

              // EMPTY STATE
              <p className="text-secondary text-center py-8">
                Complete at least 2 weeks of training to calculate your volume landmarks
              </p>
            ) : (

              // LANDMARKS TABLE
              <table className="table">
                <thead>
                  <tr>
                    <th className="text-left">Muscle Group</th>
                    <th className="text-center w-24">MEV</th>
                    <th className="text-center w-24">MRV</th>
                  </tr>
                </thead>
                <tbody>
                  {landmarks.map((landmark) => (
                    <tr key={landmark.muscle_group_name}>

                      {/* MUSCLE GROUP NAME */}
                      <td className="text-primary">{landmark.muscle_group_name}</td>

                      {/* MEV */}
                      <td className="text-center text-primary">{landmark.mev}</td>

                      {/* MRV */}
                      <td className="text-center text-primary">{landmark.mrv}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
