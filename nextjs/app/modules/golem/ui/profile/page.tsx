"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Pencil } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { UserProfile } from "../../types/userProfile";

export default function ProfilePage() {

  // DATA
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // INPUT
  const [editedProfilePrompt, setEditedProfilePrompt] = useState("");

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const router = useRouter();

  // LOAD DATA
  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/modules/golem/api/user-profile");
      if (!response.ok) {
        throw new Error("Failed to fetch profile");
      }
      const data = await response.json();
      setProfile(data);
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
          <Button
            onClick={() => router.push("/modules/golem/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

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
      </main>
    </div>
  );
}
