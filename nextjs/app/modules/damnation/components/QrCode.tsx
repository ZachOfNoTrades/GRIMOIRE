"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

// Renders a join URL as a QR image. Generated in the browser as a data URL and shown with
// <img>, so nothing is injected as HTML. Dark modules on white regardless of theme, because
// phone cameras scan a light-on-dark code poorly; the white comes from --dmn-qr-bg.
export default function QrCode({ value, label }: { value: string; label: string }) {
  // DATA
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { errorCorrectionLevel: "M", margin: 1, width: 512 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    /* QR FRAME */
    <div className="dmn-qr">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUrl} alt={label} />
      ) : (
        /* QR LOADING PLACEHOLDER */
        <div className="text-muted text-secondary">…</div>
      )}
    </div>
  );
}
