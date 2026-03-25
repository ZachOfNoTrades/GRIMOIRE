"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Module } from "@/types/module";
import { iconMap, defaultIcon } from "@/lib/iconMap";

export default function DashboardPage() {
  // DATA
  const [modules, setModules] = useState<Module[]>([]);

  // STATE
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();

  // Fetch modules
  useEffect(() => {
    async function fetchModules() {
      try {
        const response = await fetch("/api/modules");
        if (response.ok) {
          const data = await response.json();
          setModules(data);
        }
      } catch (error) {
        console.error("Error fetching modules:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchModules();
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

        {/* PAGE TITLE */}
        <h1 className="text-page-title mb-8">Modules</h1>

        {/* MODULE GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {modules.map((module) => {
            const IconComponent = iconMap[module.icon as string] || defaultIcon;
            return (
              // MODULE CARD
              <div
                key={module.id}
                className="module-card group"
                onClick={() => router.push(`/modules/${module.slug}/ui/home`)}
              >
                {/* ICON */}
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 icon-interactive group-hover:scale-105 transition-transform">
                  <IconComponent className="h-6 w-6" />
                </div>

                {/* NAME */}
                <h3 className="text-card-title">
                  {module.name}
                </h3>

                {/* DESCRIPTION */}
                <p className="text-secondary">
                  {module.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
