"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Save, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { User } from "@/types/user";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import DeleteUserModal from "./DeleteUserModal";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  // DATA
  const [user, setUser] = useState<User | null>(null);

  // INPUT
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user
  useEffect(() => {
    if (userId) {
      fetchUser();
    }
  }, [userId]);

  async function fetchUser() {
    try {
      setError(null);
      setIsLoading(true);
      const response = await fetch(`/api/users/${userId}`);

      if (!response.ok) {
        if (response.status === 404) {
          setError("User not found");
        } else {
          throw new Error("Failed to fetch user");
        }
        return;
      }

      const userData = await response.json();
      setUser(userData);
    } catch (error) {
      console.error("Error fetching user:", error);
      setError("Failed to load user details");
    } finally {
      setIsLoading(false);
    }
  }

  function handleStartEdit() {
    if (!user) return;
    setIsEditing(true);
    setEditingUser({
      name: user.name || "",
      email: user.email || "",
      global_admin: user.global_admin,
      enabled: user.enabled,
    });
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditingUser({});
  }

  async function handleSaveEdit() {
    if (!editingUser.email || !editingUser.name) {
      toast.error("Name and email are required");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingUser.name.trim(),
          email: editingUser.email.trim(),
          global_admin: editingUser.global_admin,
          enabled: editingUser.enabled,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Failed to update user");
        return;
      }

      toast.success("User updated");
      setIsEditing(false);
      setEditingUser({});
      fetchUser();
    } catch (error) {
      console.error("Error updating user:", error);
      toast.error("Failed to update user");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteUser() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        toast.error("Failed to delete user");
        return;
      }

      toast.success("User deleted");
      router.push("/settings/ui/home");
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Failed to delete user");
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  }



  // Loading placeholder
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

  // Error state
  if (error || !user) {
    return (
      <div className="page">
        <div className="page-container">

          {/* BACK BUTTON */}
          <Button
            onClick={() => router.push("/settings/ui/home")}
            className="btn-link !pl-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Button>

          {/* ERROR CARD */}
          <div className="card mt-4">
            <div className="card-content">
              <p className="text-secondary">{error || "User not found"}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-container">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-4">
          <div>
            {/* BACK BUTTON */}
            <Button
              onClick={() => router.push("/settings/ui/home")}
              className="btn-link !pl-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>

            {/* TITLE */}
            <h1 className="text-page-title">User Details</h1>
          </div>

          {/* DELETE BUTTON */}
          {!isEditing && (
            <Button
              onClick={() => setIsDeleteModalOpen(true)}
              className="btn-red !p-3"
              title="Delete user"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* USER INFO CARD */}
        <div className="card">

          {/* CARD HEADER */}
          <div className="card-header flex items-center justify-between">
            <h3 className="text-card-title">User Information</h3>

            {/* VIEW MODE — EDIT BUTTON */}
            {!isEditing && (
              <Button
                onClick={handleStartEdit}
                className="btn-blue !p-3"
                title="Edit user details"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            )}

            {/* EDIT MODE — CANCEL + SAVE */}
            {isEditing && (
              <div className="flex items-center gap-2">
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
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="btn-green"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </div>

          {/* CARD CONTENT */}
          <div className="card-content">

            {/* VIEW MODE */}
            {!isEditing ? (
              <div className="space-y-6">
                {/* NAME */}
                <div>
                  <label className="text-secondary">Name</label>
                  <p className="text-primary">{user.name}</p>
                </div>

                {/* EMAIL */}
                <div>
                  <label className="text-secondary">Email</label>
                  <p className="text-primary">{user.email}</p>
                </div>

                {/* ROLE */}
                <div>
                  <label className="text-secondary">Role</label>
                  <p className="text-primary">{user.global_admin ? "Admin" : "User"}</p>
                </div>

                {/* STATUS */}
                <div>
                  <label className="text-secondary">Status</label>
                  <p className="text-primary">{user.enabled ? "Active" : "Disabled"}</p>
                </div>

                {/* CREATED */}
                <div>
                  <label className="text-secondary">Created</label>
                  <p className="text-primary">{formatDate(user.ts_created as unknown as string)}</p>
                </div>

                {/* LAST UPDATED */}
                <div>
                  <label className="text-secondary">Last Updated</label>
                  <p className="text-primary">{formatDate(user.ts_updated as unknown as string)}</p>
                </div>
              </div>

            ) : (

              /* EDIT MODE */
              <div className="space-y-6">
                {/* NAME */}
                <div>
                  <label className="text-secondary">Name</label>
                  <input
                    type="text"
                    value={editingUser.name || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                    className="input-field"
                    placeholder="Enter name"
                    disabled={isSaving}
                  />
                </div>

                {/* EMAIL */}
                <div>
                  <label className="text-secondary">Email</label>
                  <input
                    type="email"
                    value={editingUser.email || ""}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    className="input-field"
                    placeholder="Enter email"
                    disabled={isSaving}
                  />
                </div>

                {/* ROLE DROPDOWN */}
                <div>
                  <label className="text-secondary">Role</label>
                  <select
                    value={editingUser.global_admin ? "admin" : "user"}
                    onChange={(e) => setEditingUser({ ...editingUser, global_admin: e.target.value === "admin" })}
                    className="dropdown-field"
                    disabled={isSaving}
                  >
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </select>
                </div>

                {/* STATUS DROPDOWN */}
                <div>
                  <label className="text-secondary">Status</label>
                  <select
                    value={editingUser.enabled ? "active" : "disabled"}
                    onChange={(e) => setEditingUser({ ...editingUser, enabled: e.target.value === "active" })}
                    className="dropdown-field"
                    disabled={isSaving}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DELETE USER MODAL */}
      <DeleteUserModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteUser}
        userName={user.name || user.email}
        isDeleting={isDeleting}
      />
    </div>
  );
}
