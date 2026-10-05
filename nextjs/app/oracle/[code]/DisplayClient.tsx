"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import MapCanvas, { type MapToken } from "@/app/modules/oracle/components/MapCanvas";
import AutoScroll from "@/app/modules/oracle/components/AutoScroll";
import type { DisplayMap, DisplayPanel, DisplaySnapshot } from "@/app/modules/oracle/types/oracle";
import { X } from "lucide-react";
import { loadPictures, useWhenPictureReady } from "@/app/modules/oracle/lib/imagePreload";

const POLL_MS = 1000;
const KIND_LABELS = { creature: "You see", person: "You meet", place: "Location", item: "You find" } as const;

// THE PLAYER DISPLAY — map on the left, a reference panel on the right. It asks the server once
// a second whether anything changed (a version number), and reloads the view only when it did.
export default function DisplayClient({ code }: { code: string }) {
  // DATA
  const [snapshot, setSnapshot] = useState<DisplaySnapshot | null>(null);

  // STATE
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "offline" | "signedout">("loading");
  const versionRef = useRef<number | null>(null);
  const [localId, setLocalId] = useState<string | null>(null); // an entry tapped on this screen, shown until the DM changes the panel
  const revealedRef = useRef<Set<string> | null>(null); // tokens the DM had revealed at the last snapshot
  const [revealFocus, setRevealFocus] = useState<{ id: string; x: number; y: number; nonce: number } | null>(null);
  const seenFactsRef = useRef<{ panelKey: string | null; keys: Set<string> } | null>(null); // facts already shown, so only a newly added one animates
  const [newFacts, setNewFacts] = useState<Set<string>>(new Set());
  const [pictureOpacity, setPictureOpacity] = useState(1); // how strongly the map's picture shows on this screen

  useEffect(() => {
    try {
      const saved = localStorage.getItem("orc-picture-opacity-display");
      if (saved !== null && Number.isFinite(Number(saved))) setPictureOpacity(Math.min(1, Math.max(0, Number(saved))));
    } catch {
      /* storage can be blocked; the default stands */
    }
  }, []);

  function changePictureOpacity(value: number) {
    setPictureOpacity(value);
    try {
      localStorage.setItem("orc-picture-opacity-display", String(value));
    } catch {
      /* storage can be blocked; the change still applies */
    }
  }

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
        if (response.status === 401 || response.redirected) {
          setStatus("signedout");
          return; // the sign-in ended; reloading the page asks for it again
        }
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

  // A fact that was not on the panel a moment ago animates in. The first load, and a switch to
  // another entry, only record what is there.
  const dmPanel = snapshot?.panel ?? null;
  const localToken = localId ? snapshot?.map?.tokens.find((token) => token.id === localId) ?? snapshot?.map?.companions?.find((companion) => companion.id === localId) ?? null : null;
  const localLocation = localId && !localToken ? snapshot?.map?.locations.find((location) => location.feature_id === localId) ?? null : null;
  const panel: DisplayPanel | null = localToken
    ? { kind: "entity", name: localToken.name, entity_kind: localToken.kind, attitude: localToken.attitude, details: localToken.details, image_id: localToken.image_id, knowledge: localToken.knowledge }
    : localLocation
      ? { kind: "entity", name: localLocation.name, entity_kind: "place", attitude: "neutral", details: localLocation.details, image_id: localLocation.image_id, knowledge: localLocation.knowledge }
      : dmPanel;
  const dmPanelSignature = dmPanel ? (dmPanel.kind === "entity" ? `e|${dmPanel.name}` : `i|${dmPanel.image_id}`) : "";
  useEffect(() => {
    setLocalId(null);
  }, [dmPanelSignature]);
  const panelKey = panel?.kind === "entity" ? `${panel.name}|${panel.entity_kind}` : null;
  const factKeys = panel?.kind === "entity" ? panel.knowledge.map((fact) => `${panelKey}|${fact}`) : [];
  const factSignature = factKeys.join("\n");
  useEffect(() => {
    // Only facts that arrive while the same entry stays on screen are new; the first load and a
    // switch to another entry just record what is there.
    const previous = seenFactsRef.current;
    seenFactsRef.current = { panelKey, keys: new Set(factKeys) };
    if (previous === null || panelKey === null || previous.panelKey !== panelKey) return;
    const fresh = factKeys.filter((key) => !previous.keys.has(key));
    if (fresh.length === 0) return;
    setNewFacts(new Set(fresh));
    const timer = setTimeout(() => setNewFacts(new Set()), 4500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factSignature]);

  // An entry the DM has just revealed starts the reveal sequence; the first load only records.
  useEffect(() => {
    if (!snapshot) return;
    const tokens = snapshot.map?.tokens ?? [];
    const now = new Set(tokens.filter((token) => token.revealed).map((token) => token.id));
    const previous = revealedRef.current;
    revealedRef.current = now;
    if (previous === null) return;
    const fresh = tokens.find((token) => token.revealed && !previous.has(token.id));
    if (fresh) setRevealFocus({ id: fresh.id, x: fresh.x, y: fresh.y, nonce: Date.now() });
  }, [snapshot]);

  // LOADING PLACEHOLDER
  // No version in the URL: the bytes behind an image id never change, so carrying the snapshot
  // version here threw every picture out of the browser cache on any campaign edit and made the
  // players wait for a fresh download each time. `w` picks the size this screen actually draws.
  const imageUrl = useCallback((imageId: string, width = 960) => `/api/oracle/${code}/images/${imageId}?w=${width}`, [code]);

  // Hold a map change until its picture is decoded. The geometry, the party and the tokens are
  // SVG and paint at once, while the background has to come down the wire, so switching maps
  // used to put the new party position on the old picture for a moment. Everything else about a
  // map (tokens moving, fog opening) still draws immediately: only a new background waits, and
  // only for as long as it takes, with a ceiling so a picture that never arrives cannot strand
  // the table on the old map.
  const mapBackground = useCallback((value: NonNullable<DisplaySnapshot["map"]>) => (value.background_image_id ? imageUrl(value.background_image_id, MAP_BACKGROUND_WIDTH) : null), [imageUrl]);
  const drawableMap = useWhenPictureReady(snapshot?.map ?? null, mapBackground);

  // The entries standing on this map are the ones the DM is most likely to put on screen next, so
  // they are fetched quietly once the map is up and are ready the moment one is shown.
  useEffect(() => {
    const map = snapshot?.map;
    if (!map) return;
    loadPictures([
      ...(map.companions ?? []).map((companion) => (companion.image_id ? imageUrl(companion.image_id) : null)),
      snapshot?.panel?.kind === "entity" && snapshot.panel.image_id ? imageUrl(snapshot.panel.image_id) : null,
    ]);
  }, [snapshot?.map, snapshot?.panel, imageUrl]);

  if (status === "loading") {
    return (
      <div className="orc-display">
        <p className="orc-display-message">Connecting…</p>
      </div>
    );
  }

  // SIGN-IN ENDED
  if (status === "signedout") {
    return (
      <div className="orc-display">
        <p className="orc-display-message">Signed out. <a href={`/oracle/${code}`}>Sign in again</a></p>
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

  const map = drawableMap;
  const tokens: MapToken[] = map ? map.tokens.map((token) => ({ id: token.id, name: token.name, kind: token.kind, attitude: token.attitude, x: token.x, y: token.y, down: token.down })) : [];

  return (
    // DISPLAY
    <div className="orc-display">

      {/* MAP SIDE */}
      <div className="orc-display-map">
        {map ? (
          <>
            <MapCanvas data={map.data} partyX={map.party_x} partyY={map.party_y} visionRadius={map.vision_radius} explored={map.explored} tokens={tokens} members={map.groups ?? []} companions={(map.companions ?? []).map((companion) => ({ id: companion.id, name: companion.name, kind: companion.kind, imageUrl: companion.image_id ? imageUrl(companion.image_id) : null, groupId: companion.group_id }))} backgroundUrl={map.background_image_id ? imageUrl(map.background_image_id, MAP_BACKGROUND_WIDTH) : null} pictureOpacity={pictureOpacity} onPictureOpacity={changePictureOpacity} onTokenSelect={(id) => setLocalId((current) => (current === id ? null : id))} onFeatureSelect={(id) => setLocalId((current) => (current === id ? null : id))} linkedFeatures={map.locations.map((location) => location.feature_id)} revealFocus={revealFocus} mode="player" />

            {/* MAP NAME */}
            <div className="orc-display-caption">{map.name}</div>
          </>
        ) : (

          /* NO MAP PLACEHOLDER */
          <p className="orc-display-message">No map yet</p>
        )}
      </div>

      {/* REFERENCE PANEL */}
      {panel && (
        <aside className="orc-display-panel">
          {(localToken || localLocation) && (
            <button type="button" className="orc-display-close" onClick={() => setLocalId(null)} aria-label="Close">
              <X className="w-3 h-3" /> Close
            </button>
          )}
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
                <PanelPicture key={panel.image_id} src={imageUrl(panel.image_id)} alt={panel.name} />
              )}

              {/* ENTRY */}
              <div className="orc-display-info">
                <span className="orc-display-kicker">{KIND_LABELS[panel.entity_kind]}</span>
                <h1 className="orc-display-name">{panel.name}</h1>

                {/* DESCRIPTION AND FACTS — scroll by themselves when they do not fit */}
                <AutoScroll className="orc-display-scroll" resetKey={panelKey ?? ""} revealKey={[...newFacts].join("\n")}>
                  {panel.details && <p className="orc-display-text">{panel.details}</p>}

                  {/* WHAT THE PLAYERS KNOW */}
                  {panel.knowledge.length > 0 && (
                    <div className="orc-display-facts">
                      <span className="orc-display-kicker">What you know</span>
                      {panel.knowledge.map((fact, index) => (
                        <p key={index} className="orc-display-fact" data-new={newFacts.has(`${panelKey}|${fact}`) ? "true" : undefined}>{fact}</p>
                      ))}
                    </div>
                  )}
                </AutoScroll>
              </div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}

// An entry's picture, shown whole at its own shape. It takes the height it needs up to a cap, and
// a blurred copy of itself fills any space beside it. Keyed by picture, so a new one measures afresh.
function PanelPicture({ src, alt }: { src: string; alt: string }) {
  const [ratio, setRatio] = useState<number | null>(null);
  return (
    <figure className="orc-display-figure" style={{ "--photo": `url("${src}")`, aspectRatio: ratio ?? 4 / 3 } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="orc-display-figure-img"
        src={src}
        alt={alt}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth > 0 && image.naturalHeight > 0) setRatio(image.naturalWidth / image.naturalHeight);
        }}
      />
    </figure>
  );
}

const MAP_BACKGROUND_WIDTH = 1600;
