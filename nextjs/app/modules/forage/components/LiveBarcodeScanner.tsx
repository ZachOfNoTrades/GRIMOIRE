"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType, Result } from "@zxing/library";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";

// Live-camera barcode scanner modal. Streams the rear camera (when available) into
// a <video>, feeds frames to ZXing's multi-format reader, and fires `onDecode` on
// the first successful UPC/EAN read. Designed to feel "Android-fast": the user opens
// the modal, lines up the package, and the scanner fires the moment any frame is
// decodable — no shutter button, no upload, no server round-trip.
//
// Symbology is restricted to UPC-A / UPC-E / EAN-8 / EAN-13 so a busy package can't
// accidentally surface a QR / Code 128 string as the "UPC".
//
// Falls back to "no camera" / "permission denied" messaging instead of crashing the
// modal when getUserMedia rejects (e.g. iOS Safari without HTTPS, or a denied perm).
export function LiveBarcodeScanner({
  onDecode,
  onClose,
  onFallbackToUpload,
}: {
  onDecode: (code: string, symbology: string) => void;
  onClose: () => void;
  // Optional escape hatch. When the user's browser can't grant camera access we
  // still want them to be able to hand-pick a photo (the prior flow), so the
  // caller passes a handler that opens its existing file picker.
  onFallbackToUpload?: () => void;
}) {
  // DATA
  // ZXing reader instance, kept across renders so the same decoder hop-decodes
  // successive frames without re-initializing.

  // INPUT
  // Hold the <video> node in state via a callback ref, NOT a plain useRef. The
  // Modal portals its body in a second commit (it returns null until its own
  // mount effect flips `mounted`), so on this component's mount the <video> is
  // not yet in the DOM. A plain ref would still read null when the start-camera
  // effect runs, and ZXing's `decodeFromConstraints` quietly creates a detached
  // 200×200 <video> for a null preview — the camera streams off-screen and the
  // visible element stays blank. Keying the effect on this state guarantees it
  // only runs once the real element is mounted.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  // STATE
  // `error` is non-null when the camera failed (permission, no device, HTTPS).
  // `decoding` flips on once the video element is bound and frames are flowing,
  // for the on-screen "Looking for barcode…" hint.
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);

  // Hold the latest onDecode in a ref so the start-camera effect can run exactly
  // once (empty deps) without going stale. Re-running the effect on each render
  // would tear down + restart the camera every state change — a freeze + black-flash.
  const onDecodeRef = useRef(onDecode);
  useEffect(() => { onDecodeRef.current = onDecode; }, [onDecode]);

  useEffect(() => {
    // Wait for the Modal portal to mount the <video> before starting the camera
    // (see the videoEl note above). Re-runs cleanly if the node ever changes.
    if (!videoEl) return;
    const previewEl = videoEl; // narrowed non-null capture for the async closure

    // Hints restrict ZXing to product-code symbologies. Without this the reader
    // also tries QR / Data Matrix / Aztec / PDF417 — slow AND error-prone since
    // a QR code on the same package would beat the real UPC to the first decode.
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.EAN_8,
      BarcodeFormat.EAN_13,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new BrowserMultiFormatReader(hints, {
      // Cap the frame rate ZXing samples at; default polls every animation frame
      // which burns battery for no decode-rate gain on packaged barcodes.
      delayBetweenScanAttempts: 120,
    });

    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    async function start() {
      try {
        // Prefer the rear-facing camera (where the user is pointing at the package).
        // `decodeFromConstraints` accepts the same `MediaTrackConstraints` as
        // `getUserMedia`, including `facingMode: 'environment'`.
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          previewEl,
          (result: Result | undefined, _err, ctrl) => {
            if (cancelled) {
              ctrl.stop();
              return;
            }
            if (result) {
              // Stop the stream BEFORE invoking the callback so the camera light
              // visibly turns off when the modal closes; otherwise it can linger
              // half a second while React unmounts.
              ctrl.stop();
              const symbology = result.getBarcodeFormat ? String(result.getBarcodeFormat()) : "";
              onDecodeRef.current(result.getText(), symbology);
            }
          }
        );
        controls = c;
        if (!cancelled) setDecoding(true);
      } catch (err: any) {
        if (cancelled) return;
        // Common cases worth distinguishing for the user:
        //   - NotAllowedError: user denied camera permission
        //   - NotFoundError: no camera attached
        //   - NotReadableError / OverconstrainedError: hardware busy or no rear cam
        //   - SecurityError: page not served over HTTPS (iOS Safari)
        const name = err?.name ?? "Error";
        const msg =
          name === "NotAllowedError"   ? "Camera permission denied"
          : name === "NotFoundError"    ? "No camera found on this device"
          : name === "NotReadableError" ? "Camera is already in use by another app"
          : name === "SecurityError"    ? "Camera requires HTTPS"
          : err?.message || "Could not start camera";
        setError(msg);
      }
    }
    start();

    return () => {
      cancelled = true;
      try { controls?.stop(); } catch {}
    };
  // onDecode is read through onDecodeRef, so videoEl is the only real dependency.
  }, [videoEl]);

  return (
    <Modal isOpen onClose={onClose} title="Scan barcode" zIndex={60}>

      {/* VIDEO PREVIEW — fixed 4:3 ratio so the reticle overlay stays positioned
          regardless of camera resolution. Black background uses the page bg
          token rather than a raw literal. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4 / 3",
          background: "var(--solid-background)",
          borderRadius: "0.5rem",
          overflow: "hidden",
        }}
      >
        {/* The <video> mounts unconditionally; the callback ref publishes the node
            to state so the start-camera effect runs only once it's in the DOM.
            CSS hides it when there's an error. */}
        <video
          ref={setVideoEl}
          playsInline
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: error ? "none" : "block",
          }}
        />

        {/* RETICLE */}
        {!error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                width: "80%",
                height: "32%",
                border: "2px solid color-mix(in srgb, var(--color-primary) 85%, transparent)",
                borderRadius: "0.5rem",
                boxShadow: "0 0 0 9999px color-mix(in srgb, var(--solid-background) 35%, transparent)",
              }}
            />
          </div>
        )}

        {/* ERROR OVERLAY */}
        {error && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: "1rem",
              color: "var(--color-primary)",
              background: "var(--solid-background)",
            }}
          >
            <Camera className="w-8 h-8" style={{ opacity: 0.7, marginBottom: "0.5rem" }} />
            <div style={{ marginBottom: "0.75rem" }}>{error}</div>
            {onFallbackToUpload && (
              <Button className="btn-blue" onClick={() => { onClose(); onFallbackToUpload(); }}>
                Upload a photo instead
              </Button>
            )}
          </div>
        )}
      </div>

      {/* HINT */}
      <div className="text-muted" style={{ marginTop: "0.625rem", textAlign: "center" }}>
        {error
          ? "Camera unavailable."
          : decoding
          ? "Point the barcode inside the box — it scans automatically."
          : "Starting camera…"}
      </div>

      {/* UPLOAD ESCAPE */}
      {!error && onFallbackToUpload && (
        <div style={{ marginTop: "0.625rem", textAlign: "center" }}>
          <Button className="btn-link" onClick={() => { onClose(); onFallbackToUpload(); }}>
            or upload a photo
          </Button>
        </div>
      )}
    </Modal>
  );
}
