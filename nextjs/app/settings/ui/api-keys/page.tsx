"use client";

import { useEffect, useState } from "react";
import { Edit2, KeyRound, Plus, Trash2 } from "lucide-react";
import toast, { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import HelpButton from "@/components/ui/HelpButton";
import Breadcrumbs from "@/components/Breadcrumbs";
import { UserApiKeySummary } from "@/types/apiKey";
import AddApiKeyModal from "@/app/settings/ui/user/[id]/AddApiKeyModal";
import RenameApiKeyModal from "@/app/settings/ui/user/[id]/RenameApiKeyModal";
import RevokeApiKeyModal from "@/app/settings/ui/user/[id]/RevokeApiKeyModal";

// SETTINGS → ACCOUNT → API KEYS. The signed-in user's own GRIMOIRE API keys
// (X-API-Key / Bearer grm_…), for every user — the same card and modals the
// admin-only user page carries, reachable without admin rights.

export default function ApiKeysSettingsPage() {

  // DATA
  const [apiKeys, setApiKeys] = useState<UserApiKeySummary[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<UserApiKeySummary | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserApiKeySummary | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  async function fetchApiKeys() {
    try {
      const res = await fetch("/api/users/me/api-keys");
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Couldn't load API keys");
        return;
      }
      setApiKeys(data);
    } catch {
      toast.error("Couldn't load API keys");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { fetchApiKeys(); }, []);

  async function handleRevoke() {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      const res = await fetch(`/api/users/me/api-keys/${revokeTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Couldn't revoke the key");
        return;
      }
      toast.success("API key revoked");
      setRevokeTarget(null);
      fetchApiKeys();
    } catch {
      toast.error("Couldn't revoke the key");
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs label="API keys" />

        {/* PAGE TITLE + HELP */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          <h1 className="text-page-title settings-title" style={{ flex: 1, minWidth: 0 }}>
            <KeyRound className="w-6 h-6" /> API keys
          </h1>
          <HelpButton
            title="API keys"
            sections={[
              { heading: "Use", body: "Send a key as X-API-Key or Authorization: Bearer on any API route, or as the MCP server's token. It acts as you." },
              { heading: "Shown once", body: "The full key appears only when created. Only its prefix is kept; revoke and create a new one if it's lost." },
            ]}
          />
        </div>

        {/* API KEYS CARD */}
        <div className="card">

          {/* HEADER */}
          <div className="card-header flex items-center justify-between">
            <h3 className="text-card-title">Keys</h3>

            {/* ADD KEY BUTTON */}
            <Button className="btn-blue" onClick={() => setIsAddOpen(true)}>
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
                {isLoading && (
                  <tr className="table-row">
                    <td className="table-cell" colSpan={5}>
                      <div className="loading-container">
                        <div className="loading-spinner" />
                      </div>
                    </td>
                  </tr>
                )}

                {/* EMPTY PLACEHOLDER */}
                {!isLoading && apiKeys.length === 0 && (
                  <tr className="table-row">
                    <td className="table-empty" colSpan={5}>No API keys</td>
                  </tr>
                )}

                {/* API KEY ROWS */}
                {!isLoading && apiKeys.map((key) => (
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
                        <Button className="btn-blue !p-2" onClick={() => setRenameTarget(key)} title="Rename">
                          <Edit2 className="w-4 h-4" />
                        </Button>

                        {/* REVOKE BUTTON */}
                        <Button className="btn-red !p-2" onClick={() => setRevokeTarget(key)} title="Revoke">
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

        {/* ADD API KEY MODAL */}
        <AddApiKeyModal
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onKeyCreated={fetchApiKeys}
        />

        {/* RENAME API KEY MODAL */}
        <RenameApiKeyModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          onKeyRenamed={fetchApiKeys}
          apiKey={renameTarget}
        />

        {/* REVOKE API KEY MODAL */}
        <RevokeApiKeyModal
          isOpen={!!revokeTarget}
          onClose={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          keyName={revokeTarget?.name || ""}
          isRevoking={isRevoking}
        />

        {/* TOAST */}
        <Toaster position="bottom-center" />
      </div>
    </div>
  );
}
