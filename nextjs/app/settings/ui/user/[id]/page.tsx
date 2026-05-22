"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit2, Plus, Save, Trash2 } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { User } from "@/types/user";
import { UserApiKeySummary } from "@/types/apiKey";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import DeleteUserModal from "./DeleteUserModal";
import AddApiKeyModal from "./AddApiKeyModal";
import RenameApiKeyModal from "./RenameApiKeyModal";
import RevokeApiKeyModal from "./RevokeApiKeyModal";

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  // DATA
  const [user, setUser] = useState<User | null>(null);
  const [apiKeys, setApiKeys] = useState<UserApiKeySummary[]>([]);

  // INPUT
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState(false);
  const [renameKeyTarget, setRenameKeyTarget] = useState<UserApiKeySummary | null>(null);
  const [revokeKeyTarget, setRevokeKeyTarget] = useState<UserApiKeySummary | null>(null);
  const [isRevokingKey, setIsRevokingKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user
  useEffect(() => {
    if (userId) {
      fetchUser();
      fetchApiKeys();
    }
  }, [userId]);

  async function fetchApiKeys() {
    try {
      const response = await fetch("/api/users/me/api-keys");
      if (response.ok) {
        const data = await response.json();
        setApiKeys(data);
      }
    } catch (error) {
      console.error("Error fetching API keys:", error);
    } finally {
      setIsApiKeysLoading(false);
    }
  }

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
      generation_limit: user.generation_limit,
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
          generation_limit: editingUser.generation_limit,
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

  async function handleRevokeKey() {
    if (!revokeKeyTarget) return;
    setIsRevokingKey(true);
    try {
      const response = await fetch(`/api/users/me/api-keys/${revokeKeyTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Failed to revoke API key");
        return;
      }

      toast.success("API key revoked");
      setRevokeKeyTarget(null);
      fetchApiKeys();
    } catch (error) {
      console.error("Error revoking API key:", error);
      toast.error("Failed to revoke API key");
    } finally {
      setIsRevokingKey(false);
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

      <Toaster />

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

                {/* GENERATION LIMIT */}
                <div>
                  <label className="text-secondary">Generation Limit</label>
                  <p className="text-primary">{user.generation_limit === 0 ? "Unlimited" : `${user.generation_limit} per ${process.env.GENERATION_WINDOW_HOURS} hours`}</p>
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

                {/* GENERATION LIMIT */}
                <div>
                  <label className="text-secondary">Generation Limit (0 = unlimited)</label>
                  <input
                    type="number"
                    min={0}
                    value={editingUser.generation_limit ?? 15}
                    onChange={(e) => setEditingUser({ ...editingUser, generation_limit: parseInt(e.target.value) || 0 })}
                    className="input-field"
                    placeholder=""
                    disabled={isSaving}
                  />
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

        {/* API KEYS CARD */}
        <div className="card mt-6">

          {/* HEADER */}
          <div className="card-header flex items-center justify-between">
            <h3 className="text-card-title">API Keys</h3>

            {/* ADD KEY BUTTON */}
            <Button
              className="btn-blue"
              onClick={() => setIsAddKeyModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              New Key
            </Button>
          </div>

          {/* API KEYS TABLE */}
          <div className="table-container" style={{ border: "none" }}>
            <table className="table">
              <thead className="table-header">
                <tr className="table-header-row">
                  <th className="table-header-cell">Name</th>
                  <th className="table-header-cell">Prefix</th>
                  <th className="table-header-cell">Created</th>
                  <th className="table-header-cell">Last Used</th>
                  <th className="table-header-cell"></th>
                </tr>
              </thead>
              <tbody className="table-body">

                {/* LOADING PLACEHOLDER */}
                {isApiKeysLoading && (
                  <tr className="table-row">
                    <td className="table-cell" colSpan={5}>
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER */}
                {!isApiKeysLoading && apiKeys.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>No API keys found</td>
                  </tr>
                )}

                {/* API KEY ROWS */}
                {!isApiKeysLoading && apiKeys.map((key) => (
                  <tr key={key.id} className="table-row">
                    <td className="table-cell">{key.name}</td>
                    <td className="table-cell font-mono">{key.key_prefix}</td>
                    <td className="table-cell">{new Date(key.ts_created).toLocaleString()}</td>
                    <td className="table-cell">
                      {key.ts_last_used ? new Date(key.ts_last_used).toLocaleString() : "Never"}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center justify-end gap-2">

                        {/* RENAME BUTTON */}
                        <Button
                          className="btn-blue !p-2"
                          onClick={() => setRenameKeyTarget(key)}
                          title="Rename"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>

                        {/* REVOKE BUTTON */}
                        <Button
                          className="btn-red !p-2"
                          onClick={() => setRevokeKeyTarget(key)}
                          title="Revoke"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

      {/* ADD API KEY MODAL */}
      <AddApiKeyModal
        isOpen={isAddKeyModalOpen}
        onClose={() => setIsAddKeyModalOpen(false)}
        onKeyCreated={fetchApiKeys}
      />

      {/* RENAME API KEY MODAL */}
      <RenameApiKeyModal
        isOpen={!!renameKeyTarget}
        onClose={() => setRenameKeyTarget(null)}
        onKeyRenamed={fetchApiKeys}
        apiKey={renameKeyTarget}
      />

      {/* REVOKE API KEY MODAL */}
      <RevokeApiKeyModal
        isOpen={!!revokeKeyTarget}
        onClose={() => setRevokeKeyTarget(null)}
        onConfirm={handleRevokeKey}
        keyName={revokeKeyTarget?.name || ""}
        isRevoking={isRevokingKey}
      />
    </div>
  );
}
