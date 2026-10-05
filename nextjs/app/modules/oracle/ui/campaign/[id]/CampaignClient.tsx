"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TableSnapshot } from "../../../types/oracle";
import type { ImageSource } from "../../../components/ImagePicker";
import type { CampaignTab } from "../../../components/SessionBar";
import { CampaignTabsContext } from "../../campaignTabs";
import PrepClient from "./prep/PrepClient";
import TableClient from "./table/TableClient";
import ReferenceClient from "./reference/ReferenceClient";
import LogClient from "./log/LogClient";

interface CampaignClientProps {
  snapshot: TableSnapshot;
  imageSources: ImageSource[];
  initialTab: CampaignTab;
}

const TABS: CampaignTab[] = ["prep", "table", "reference", "log"];

const isTab = (value: string | null): value is CampaignTab => !!value && (TABS as string[]).includes(value);

// THE CAMPAIGN PAGE — Prep, Table, Reference and Log on one page, switched here.
//
// They used to be four routes, so every switch reloaded the whole campaign from the server and
// built the tab again from scratch: the map you were on, the panel you had open and anything
// half-typed were all gone on the way back. Now the campaign is loaded once and a tab that has
// been opened stays mounted, so returning to it finds it exactly as it was left.
//
// A tab is built the first time it is shown rather than all four up front: measuring a hidden
// map gives nothing useful, and most of a session never leaves the Table.
export default function CampaignClient({ snapshot, imageSources, initialTab }: CampaignClientProps) {
  const [tab, setTab] = useState<CampaignTab>(initialTab);
  const [built, setBuilt] = useState<CampaignTab[]>([initialTab]);

  const show = useCallback((wanted: CampaignTab) => {
    setBuilt((list) => (list.includes(wanted) ? list : [...list, wanted]));
    setTab(wanted);
  }, []);

  // The tab is in the address bar, so a reload or a bookmark lands where the DM left off. It is
  // replaced rather than pushed: switching tabs is a change of view, not a step to go Back
  // through, and pushing would bury the campaign list under every switch of the evening.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") === tab) return;
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
  }, [tab]);

  // Someone moving through history from outside this page (a bookmark, an edited address).
  useEffect(() => {
    const onPop = () => {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      if (isTab(wanted)) show(wanted);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [show]);

  const panels = useMemo(
    () => ({
      prep: <PrepClient snapshot={snapshot} imageSources={imageSources} />,
      table: <TableClient snapshot={snapshot} imageSources={imageSources} />,
      reference: <ReferenceClient snapshot={snapshot} imageSources={imageSources} />,
      log: <LogClient snapshot={snapshot} imageSources={imageSources} />,
    }),
    [snapshot, imageSources],
  );

  return (
    // CAMPAIGN TABS
    <>
      {TABS.filter((key) => built.includes(key)).map((key) => (
        <CampaignTabsContext.Provider key={key} value={{ tab, setTab: show, isActive: key === tab }}>
          <div className="orc-tab-panel" hidden={key !== tab} inert={key !== tab}>
            {panels[key]}
          </div>
        </CampaignTabsContext.Provider>
      ))}
    </>
  );
}
