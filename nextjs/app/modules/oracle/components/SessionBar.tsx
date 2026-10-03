"use client";

import { BookOpen, EyeOff, FileText, Map as MapIcon, Monitor, PanelLeft, ScrollText, Settings, Swords } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import HelpButton, { type HelpSection } from "@/components/ui/HelpButton";

export type CampaignTab = "table" | "reference" | "prep" | "log";

interface SessionBarProps {
  campaignId: string;
  campaignName: string;
  active: CampaignTab;
  help: HelpSection[];
  // Table tab only: the live session button, what the players see, and the blank switch.
  sessionLabel?: string | null;
  onOpenSessions?: () => void;
  displayLabel?: string | null;
  isBlank?: boolean;
  onToggleBlank?: () => void;
}

const TABS: { key: CampaignTab; label: string; icon: typeof MapIcon }[] = [
  { key: "prep", label: "Prep", icon: FileText },
  { key: "table", label: "Table", icon: MapIcon },
  { key: "reference", label: "Reference", icon: BookOpen },
  { key: "log", label: "Log", icon: ScrollText },
];

// The strip under the navbar on every campaign page: which campaign, the four tabs, and — on the
// Table tab — the live session and what the players are looking at.
export default function SessionBar({ campaignId, campaignName, active, help, sessionLabel, onOpenSessions, displayLabel, isBlank, onToggleBlank }: SessionBarProps) {
  return (
    // SESSION BAR
    <div className="orc-bar">

      {/* CAMPAIGN */}
      <div className="orc-bar-left">

        {/* CAMPAIGN LINK — back to the campaign list */}
        <Link href="/modules/oracle/ui/home" className="orc-bar-campaign" title="All campaigns">
          <Swords className="w-4 h-4 shrink-0" aria-hidden />
          <span className="orc-bar-name">{campaignName}</span>
        </Link>

        {/* SESSIONS BUTTON */}
        {onOpenSessions && (
          <button type="button" className="orc-bar-scene" onClick={onOpenSessions} title="Sessions" aria-label="Open the session list">
            <PanelLeft className="w-4 h-4 shrink-0" aria-hidden />
            <span className="orc-bar-scene-label">{sessionLabel ?? "Sessions"}</span>
          </button>
        )}
      </div>

      {/* TABS */}
      <nav className="orc-tabs" aria-label="Campaign pages">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link key={tab.key} href={`/modules/oracle/ui/campaign/${campaignId}/${tab.key}`} className="orc-tab" aria-current={active === tab.key ? "page" : undefined}>
              <Icon className="w-4 h-4" aria-hidden />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* RIGHT SIDE */}
      <div className="orc-bar-right">

        {/* DISPLAY STATUS */}
        {displayLabel !== undefined && (
          <span className={`badge ${isBlank ? "badge-gray" : "badge-green"} orc-bar-display`} title="What the players see">
            <Monitor className="w-3 h-3" aria-hidden /> <span className="orc-bar-display-text">{isBlank ? "Display blank" : displayLabel ?? "Map"}</span>
          </span>
        )}

        {/* BLANK BUTTON */}
        {onToggleBlank && (
          <Button className={isBlank ? "btn-blue" : "btn-off"} onClick={onToggleBlank} title={isBlank ? "Show the display again" : "Blank the player display"} aria-label={isBlank ? "Show the display again" : "Blank the player display"}>
            <EyeOff className="w-4 h-4" /> <span className="hidden xl:inline">{isBlank ? "Unblank" : "Blank"}</span>
          </Button>
        )}

        {/* SETTINGS LINK */}
        <Link className="btn btn-link" href="/modules/oracle/ui/settings" aria-label="Oracle settings" title="Settings">
          <Settings className="w-5 h-5" />
        </Link>

        {/* HELP */}
        <HelpButton title="Oracle" sections={help} className="btn-link shrink-0" />
      </div>
    </div>
  );
}
