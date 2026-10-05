"use client";

import { createContext, useContext } from "react";
import type { CampaignTab } from "../components/SessionBar";

interface CampaignTabs {
  tab: CampaignTab;
  setTab: (tab: CampaignTab) => void;
  /** The tab this client is rendered as; false while it sits mounted but off screen. */
  isActive: boolean;
}

// The four campaign tabs live on one page and are switched here rather than by navigating, so a
// tab keeps everything it had — scroll, a half-typed note, which map was open — and the campaign
// is loaded once instead of once per tab. A client rendered outside this provider (none today)
// still works: SessionBar falls back to links.
export const CampaignTabsContext = createContext<CampaignTabs | null>(null);

export const useCampaignTabs = () => useContext(CampaignTabsContext);

/** True unless this client is a tab that is currently off screen. */
export function useIsActiveTab(): boolean {
  return useContext(CampaignTabsContext)?.isActive ?? true;
}
