"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { CampaignTab } from "./SessionBar";
import { useCampaignTabs } from "../ui/campaignTabs";

interface TabLinkProps {
  campaignId: string;
  tab: CampaignTab;
  className?: string;
  children: ReactNode;
}

// A link to another campaign tab. On the campaign page the four tabs are already loaded, so this
// switches to one in place; anywhere else it is an ordinary link to that address.
export default function TabLink({ campaignId, tab, className, children }: TabLinkProps) {
  const tabs = useCampaignTabs();
  if (!tabs) {
    return <Link href={`/modules/oracle/ui/campaign/${campaignId}?tab=${tab}`} className={className}>{children}</Link>;
  }
  return (
    <button type="button" className={className} onClick={() => tabs.setTab(tab)}>
      {children}
    </button>
  );
}
