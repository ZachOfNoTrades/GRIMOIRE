"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Module } from "@/types/module";
import { ModuleBadgeMap } from "@/types/dashboardBadge";
import { iconMap, defaultIcon } from "@/lib/iconMap";
import HelpButton from "@/components/ui/HelpButton";

export default function DashboardPage() {
  // DATA
  const [modules, setModules] = useState<Module[]>([]);
  const [badges, setBadges] = useState<ModuleBadgeMap>({});

  // STATE
  const [isLoading, setIsLoading] = useState(true);
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] || "";

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

  // Fetch the per-module "needs attention" badges. Kept separate from the module fetch so the
  // grid paints as soon as the modules land — badges are decoration and cost four module DBs,
  // so they must never gate the cards. Failures stay silent for the same reason.
  useEffect(() => {
    async function fetchBadges() {
      try {
        const response = await fetch("/api/dashboard/badges");
        if (!response.ok) return;
        const data = await response.json();
        // Guard against an { error } envelope being spread into badge state.
        if (data && typeof data === "object" && !("error" in data)) setBadges(data);
      } catch (error) {
        console.error("Error fetching dashboard badges:", error);
      }
    }

    fetchBadges();
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
        <div className="mb-8 flex items-center justify-between gap-2">

          {/* PAGE TITLE */}
          <h1 className="text-page-title">
            {firstName ? `Welcome, ${firstName}` : "Modules"}
          </h1>

          {/* HELP */}
          <HelpButton
            title="Grimoire"
            sections={[
              { heading: "Modules", body: (<>Each card opens a module:<ul><li><strong>Golem</strong> — workout &amp; program tracking.</li><li><strong>Rune</strong> — flash cards with spaced repetition.</li><li><strong>Quest</strong> — tasks &amp; habits with a coin economy.</li><li><strong>Forage</strong> — food logging &amp; nutrition targets.</li></ul></>) },
              { heading: "Badges", body: (<>A card shows a badge when that module needs attention today:<ul><li><strong>Golem</strong> — today&apos;s workout (green once you finish it).</li><li><strong>Rune</strong> — how many cards are due.</li><li><strong>Quest</strong> — today&apos;s bonus task, and anything past its reminder time.</li><li><strong>Forage</strong> — a due weekly check-in, and nothing logged yet by the time set in Forage &rarr; Settings &rarr; Home badge.</li></ul></>) },
              { heading: "Per-module help", body: "Every module page has its own help (?) button in the header that explains how that module works." },
            ]}
          />
        </div>

        {/* MODULE GRID */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
          {modules.map((module) => {
            const IconComponent = iconMap[module.icon as string] || defaultIcon;
            const moduleBadges = badges[module.slug] ?? [];
            return (
              // MODULE CARD
              <div
                key={module.id}
                className="module-card group"
                onClick={() => router.push(`/modules/${module.slug}/ui/home`)}
              >
                {/* ICON */}
                <div className="module-card-icon mb-3 sm:mb-4 group-hover:scale-105 transition-transform">
                  <IconComponent />
                </div>

                {/* NAME */}
                <h3 className="text-card-title">
                  {module.name}
                </h3>

                {/* DESCRIPTION */}
                <p className="text-secondary">
                  {module.description}
                </p>

                {moduleBadges.length > 0 && (
                  /* BADGES — what's due in this module right now */
                  <div className="module-card-badges">
                    {moduleBadges.map((badge) => (
                      <span
                        key={badge.key}
                        className={`module-card-badge badge-${badge.tone}`}
                        title={badge.detail}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
