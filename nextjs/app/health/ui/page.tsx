"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { blurOnEnter, selectOnFocus } from "@/lib/inputBehavior";
import { HealthSnapshot } from "@/types/health";

const CM_PER_IN = 2.54;
const KG_PER_LB = 0.45359237;

// Display conversion for the "latest metric" rows. The store keeps canonical
// SI units; the user reads pounds and inches unless the profile says otherwise.
function displayValue(unit: string, value: number, massUnit: string, heightUnit: string) {
  if (unit === "kg" && massUnit === "lb") return { value: value / KG_PER_LB, unit: "lb" };
  if (unit === "cm" && heightUnit === "in") return { value: value / CM_PER_IN, unit: "in" };
  return { value, unit };
}

const CATEGORY_LABELS: Record<string, string> = {
  body: "Body",
  vitals: "Vitals",
  activity: "Activity",
  sleep: "Sleep",
  nutrition: "Nutrition",
};

export default function HealthProfilePage() {
  // DATA
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);

  // INPUT
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [heightDisplay, setHeightDisplay] = useState("");
  const [restingHr, setRestingHr] = useState("");
  const [massUnit, setMassUnit] = useState<"lb" | "kg">("lb");
  const [heightUnit, setHeightUnit] = useState<"in" | "cm">("in");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Push a fetched snapshot into both the read model and the edit fields.
  const applySnapshot = useCallback((data: HealthSnapshot) => {
    setSnapshot(data);
    setDateOfBirth(data.profile.date_of_birth ?? "");
    setBiologicalSex(data.profile.biological_sex ?? "");
    setRestingHr(data.profile.resting_heart_rate == null ? "" : String(data.profile.resting_heart_rate));
    setMassUnit(data.profile.preferred_mass_unit);
    setHeightUnit(data.profile.preferred_height_unit);
    setHeightDisplay(
      data.profile.height_cm == null
        ? ""
        : (data.profile.preferred_height_unit === "in"
            ? data.profile.height_cm / CM_PER_IN
            : data.profile.height_cm
          ).toFixed(1),
    );
  }, []);

  async function fetchSnapshot() {
    try {
      const response = await fetch("/api/health/profile");
      if (!response.ok) throw new Error("request failed");
      applySnapshot(await response.json());
    } catch (error) {
      console.error("Error fetching health profile:", error);
      toast.error("Failed to load health profile");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    setIsSaving(true);
    try {
      // Height is edited in the user's preferred unit but stored in cm.
      const heightNumber = heightDisplay === "" ? null : Number(heightDisplay);
      const response = await fetch("/api/health/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date_of_birth: dateOfBirth || null,
          biological_sex: biologicalSex || null,
          height_cm: heightNumber == null ? null : heightUnit === "in" ? heightNumber * CM_PER_IN : heightNumber,
          resting_heart_rate: restingHr === "" ? null : Number(restingHr),
          preferred_mass_unit: massUnit,
          preferred_height_unit: heightUnit,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "request failed");
      applySnapshot(data);
      toast.success("Health profile saved");
    } catch (error) {
      console.error("Error saving health profile:", error);
      toast.error((error as Error).message || "Failed to save health profile");
    } finally {
      setIsSaving(false);
    }
  }

  // Import a Google Health Connect export (or one this app produced).
  async function importFile(file: File) {
    try {
      const payload = JSON.parse(await file.text());
      const response = await fetch("/api/health/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "request failed");
      toast.success(`Imported ${data.imported} record${data.imported === 1 ? "" : "s"} (${data.skipped} skipped)`);
      await fetchSnapshot();
    } catch (error) {
      console.error("Error importing health records:", error);
      toast.error((error as Error).message || "Failed to import health records");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  // LOADING PLACEHOLDER
  if (isLoading) {
    return (
      <div className="page">
        <div className="page-container">
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        </div>
      </div>
    );
  }

  const latest = snapshot?.latest ?? [];
  const categories = [...new Set(latest.map((row) => row.category))];

  return (
    <div className="page">
      <div className="page-container">

        {/* PAGE HEADER */}
        <div className="flex items-center justify-between">
          <h1 className="text-page-title">Health</h1>
          <div className="flex items-center gap-2">

            {/* EXPORT BUTTON — Health Connect-compatible JSON download */}
            <a href="/api/health/export" download>
              <Button className="btn">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </a>

            {/* IMPORT BUTTON */}
            <Button className="btn" onClick={() => importInputRef.current?.click()}>
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importFile(file);
              }}
            />
          </div>
        </div>

        {/* PROFILE CARD */}
        <div className="card mt-6">

          {/* HEADER */}
          <div className="card-header flex items-center justify-between">
            <h3 className="text-card-title">Profile</h3>
            {snapshot?.age_years != null && (
              <span className="badge badge-gray">{snapshot.age_years} yrs</span>
            )}
          </div>

          {/* FIELDS — nested inside card-content because .card-content is itself
              a flex column, so a `grid` utility on it would be overridden. */}
          <div className="card-content">
            <div className="grid gap-4 sm:grid-cols-2">

            {/* DATE OF BIRTH */}
            <div>
              <label className="stat-label" htmlFor="health-dob">Date of birth</label>
              <input
                id="health-dob"
                type="date"
                className="input-field"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
              />
            </div>

            {/* BIOLOGICAL SEX */}
            <div>
              <label className="stat-label" htmlFor="health-sex">Biological sex</label>
              <select
                id="health-sex"
                className="input-field"
                value={biologicalSex}
                onChange={(e) => setBiologicalSex(e.target.value)}
              >
                <option value="">Not set</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="unspecified">Prefer not to say</option>
              </select>
            </div>

            {/* HEIGHT */}
            <div>
              <label className="stat-label" htmlFor="health-height">Height ({heightUnit})</label>
              <input
                id="health-height"
                type="number"
                inputMode="decimal"
                step="0.1"
                className="input-field"
                value={heightDisplay}
                onChange={(e) => setHeightDisplay(e.target.value)}
                onFocus={selectOnFocus}
                onKeyDown={blurOnEnter}
                placeholder="0.0"
              />
            </div>

            {/* RESTING HEART RATE */}
            <div>
              <label className="stat-label" htmlFor="health-rhr">Resting heart rate (bpm)</label>
              <input
                id="health-rhr"
                type="number"
                inputMode="numeric"
                className="input-field"
                value={restingHr}
                onChange={(e) => setRestingHr(e.target.value)}
                onFocus={selectOnFocus}
                onKeyDown={blurOnEnter}
                placeholder="0"
              />
            </div>

            {/* UNIT PREFERENCES */}
            <div>
              <label className="stat-label" htmlFor="health-mass-unit">Weight unit</label>
              <select
                id="health-mass-unit"
                className="input-field"
                value={massUnit}
                onChange={(e) => setMassUnit(e.target.value as "lb" | "kg")}
              >
                <option value="lb">Pounds (lb)</option>
                <option value="kg">Kilograms (kg)</option>
              </select>
            </div>
            <div>
              <label className="stat-label" htmlFor="health-height-unit">Height unit</label>
              <select
                id="health-height-unit"
                className="input-field"
                value={heightUnit}
                onChange={(e) => setHeightUnit(e.target.value as "in" | "cm")}
              >
                <option value="in">Inches (in)</option>
                <option value="cm">Centimeters (cm)</option>
              </select>
            </div>
            </div>
          </div>

          {/* SAVE */}
          <div className="card-content pt-0">
            <Button className="btn-blue" onClick={saveProfile} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>

        {/* LATEST METRICS CARD */}
        <div className="card mt-6">

          {/* HEADER */}
          <div className="card-header">
            <h3 className="text-card-title">Latest measurements</h3>
          </div>

          {/* EMPTY PLACEHOLDER */}
          {latest.length === 0 && (
            <div className="card-content">
              <p className="stat-label">
                Nothing recorded yet. Log a weigh-in in Forage, or import a Google Health export.
              </p>
            </div>
          )}

          {/* METRIC ROWS, GROUPED BY CATEGORY */}
          {categories.map((category) => (
            <div key={category} className="card-content pt-0">
              <h4 className="section-heading">{CATEGORY_LABELS[category] ?? category}</h4>
              <div className="bordered-list">
                {latest.filter((row) => row.category === category).map((row) => {
                  const shown = displayValue(row.unit, row.value, massUnit, heightUnit);
                  return (
                    <div key={row.metric_code} className="list-row">
                      <div className="list-row-title">{row.display_name}</div>
                      <div className="list-row-meta">
                        {new Date(row.measured_at).toLocaleDateString()} · {row.source}
                      </div>
                      <div className="stat-value ml-auto">
                        {shown.value.toLocaleString(undefined, { maximumFractionDigits: 1 })} {shown.unit}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
