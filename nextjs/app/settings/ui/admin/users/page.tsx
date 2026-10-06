"use client";

import { useState, useEffect } from "react";
import { useRowNav } from "@/lib/useRowNav";
import { Plus, Users } from "lucide-react";
import { User } from "@/types/user";
import { Button } from "@/components/ui/button";
import AddUserModal from "../AddUserModal";
import Breadcrumbs from "@/components/Breadcrumbs";

// Settings → Admin → Users: every account, one row each, opening the user's detail
// page. Moved here from the admin hub so the hub keeps the standard settings layout.
export default function AdminUsersPage() {
  // DATA
  const [users, setUsers] = useState<User[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const rowNav = useRowNav();

  // Fetch users
  async function fetchUsers() {
    try {
      const response = await fetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    /* PAGE */
    <div className="page">

      {/* PAGE CONTAINER */}
      <div className="page-container">

        {/* BREADCRUMBS */}
        <Breadcrumbs label="Users" />

        {/* PAGE HEADER */}
        <div className="flex items-center justify-between">
          <h1 className="text-page-title settings-title">
            <Users className="w-6 h-6" /> Users
          </h1>

          {/* ADD USER BUTTON */}
          <Button className="btn-blue" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="w-4 h-4" />
            Add user
          </Button>
        </div>

        {/* USERS TABLE */}
        <div className="table-container mt-6">
          <table className="table">
            <thead className="table-header">
              <tr className="table-header-row">
                <th className="table-header-cell">Name</th>
                <th className="table-header-cell">Email</th>
                <th className="table-header-cell">Status</th>
                <th className="table-header-cell">Role</th>
              </tr>
            </thead>
            <tbody className="table-body">

              {/* LOADING PLACEHOLDER */}
              {isLoading && (
                <tr className="table-row">
                  <td className="table-cell" colSpan={4}>
                    <div className="loading-container">
                      <div className="loading-spinner" />
                    </div>
                  </td>
                </tr>
              )}

              {/* EMPTY PLACEHOLDER */}
              {!isLoading && users.length === 0 && (
                <tr className="table-row">
                  <td className="table-empty" colSpan={4}>No users</td>
                </tr>
              )}

              {/* USER ROWS */}
              {!isLoading && users.map((user) => (
                <tr
                  key={user.id}
                  className="table-row table-row-clickable"
                  {...rowNav(`/settings/ui/user/${user.id}`)}
                >
                  <td className="table-cell">{user.name}</td>
                  <td className="table-cell">{user.email}</td>
                  <td className="table-cell">
                    {user.enabled ? (
                      <span className="badge-green">Active</span>
                    ) : (
                      <span className="badge-red">Disabled</span>
                    )}
                  </td>
                  <td className="table-cell">
                    {user.global_admin ? (
                      <span className="badge-blue">Admin</span>
                    ) : (
                      <span className="badge-gray">User</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD USER MODAL */}
      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onUserAdded={fetchUsers}
      />
    </div>
  );
}
