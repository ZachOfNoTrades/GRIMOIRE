"use client";

import { useEffect, useRef, useState } from "react";
import MapCanvas, { type MapToken } from "@/app/modules/oracle/components/MapCanvas";
import type { DisplaySnapshot } from "@/app/modules/oracle/types/oracle";

const POLL_MS = 1000;
const KIND_LABELS = { creature: "You see", person: "You meet", place: "Location" } as const;

// THE PLAYER DISPLAY — map on the left, a reference panel on the right. It asks the server once
// a second whether anything changed (a version number), and reloads the view only when it did.
export default function DisplayClient({ code }: { code: string }) {
  // DATA
  const [snapshot, setSnapshot] = useState<DisplaySnapshot | null>(null);

  // STATE
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "offline">("loading");
  const versionRef = useRef<number | null>(null);

  // The display is always dark, whatever theme this browser has saved: it is a shared screen
  // and the fog has to be black. The lock keeps the site's theme sync (which re-stamps the saved
  // preference after its fetch and on storage events from other tabs) from painting over it.
  // The previous theme is put back on leaving.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.theme;
    root.dataset.themeLock = "dark";
    root.dataset.theme = "dark";
    return () => {
      delete root.dataset.themeLock;
      if (previous) root.dataset.theme = previous;
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const query = versionRef.current === null ? "" : `?v=${versionRef.current}`;
        const response = await fetch(`/api/oracle/${code}/state${query}`, { cache: "no-store" });
        if (stopped) return;
        if (response.status === 404) {
          setStatus("missing");
          return; // a wrong code never becomes right; stop asking
        }
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        if (stopped) return;
        if (!data.unchanged) {
          versionRef.current = data.version;
          setSnapshot(data as DisplaySnapshot);
        }
        setStatus("ready");
      } catch {
        if (!stopped) setStatus((current) => (current === "loading" ? "loading" : "offline"));
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }
    poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code]);

  // LOADING PLACEHOLDER
  if (status === "loading") {
    return (
      <div className="orc-display">
        <p className="orc-display-message">Connecting…</p>
      </div>
    );
  }

  // UNKNOWN CODE
  if (status === "missing" || !snapshot) {
    return (
      <div className="orc-display">
        <p className="orc-display-message">No display with the code {code}. Check the code on the DM&apos;s screen.</p>
      </div>
    );
  }

  // BLANKED BY THE DM
  if (snapshot.blank) {
    return <div className="orc-display" aria-label="The display is blank" />;
  }

  const map = snapshot.map;
  const panel = snapshot.panel;
  const tokens: MapToken[] = map ? map.tokens.map((token) => ({ ...token, kind: "creature" as const })) : [];
  const imageUrl = (imageId: string) => `/api/oracle/${code}/images/${imageId}?v=${snapshot.version}`;

  return (
    // DISPLAY
    <div className="orc-display">

      {/* MAP SIDE */}
      <div className="orc-display-map">
        {map ? (
          <>
            <MapCanvas data={map.data} partyX={map.party_x} partyY={map.party_y} visionRadius={map.vision_radius} explored={map.explored} tokens={tokens} members={map.members ?? []} backgroundUrl={map.background_image_id ? imageUrl(map.background_image_id) : null} mode="player" />

            {/* MAP NAME */}
            <div className="orc-display-caption">{map.name}<span className="orc-display-scale"> · {map.data.scale_label}</span></div>
          </>
        ) : (

          /* NO MAP PLACEHOLDER */
          <p className="orc-display-message">No map yet</p>
        )}
      </div>

      {/* REFERENCE PANEL */}
      {panel && (
        <aside className="orc-display-panel">
          {panel.kind === "image" ? (
            <>
              {/* PICTURE */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="orc-display-photo orc-display-photo-full" src={imageUrl(panel.image_id)} alt={panel.caption} />

              {/* CAPTION */}
              <div className="orc-display-info" style={{ flex: "0 0 auto" }}>
                <h1 className="orc-display-name">{panel.caption}</h1>
              </div>
            </>
          ) : (
            <>
              {/* PORTRAIT */}
              {panel.image_id && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="orc-display-photo" src={imageUrl(panel.image_id)} alt={panel.name} />
              )}

              {/* ENTRY */}
              <div className="orc-display-info">
                <span className="orc-display-kicker">{KIND_LABELS[panel.entity_kind]}</span>
                <h1 className="orc-display-name">{panel.name}</h1>
                {panel.details && <p className="orc-display-text">{panel.details}</p>}

                {/* WHAT THE PLAYERS KNOW */}
                {panel.knowledge.length > 0 && (
                  <div className="orc-display-facts">
                    <span className="orc-display-kicker">What you know</span>
                    {panel.knowledge.map((fact, index) => (
                      <p key={index} className="orc-display-fact">{fact}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
