"use client";

import { useState, useEffect } from "react";
import { User } from "@/types/user";

export default function SettingsConsolePage() {
  // DATA
  const [users, setUsers] = useState<User[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  // Fetch users
  useEffect(() => {
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

    fetchUsers();
  }, []);

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

  return (
    <div className="page">
      <div className="page-container">

        {/* PAGE HEADER */}
        <h1 className="text-page-title">Settings</h1>

        {/* USERS CARD */}
        <div className="card mt-6">

          {/* HEADER */}
          <div className="card-header">
            <h3 className="text-card-title">Users</h3>
          </div>

          {/* USERS TABLE */}
          <div className="table-container" style={{ border: "none" }}>
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
                    <td className="table-empty" colSpan={4}>No users found</td>
                  </tr>
                )}

                {/* USER ROWS */}
                {!isLoading && users.map((user) => (
                  <tr key={user.id} className="table-row">
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
      </div>
    </div>
  );
}
