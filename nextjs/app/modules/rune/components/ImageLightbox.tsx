"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppHeight } from "@/lib/useAppHeight";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

// Full-screen preview for an image embedded in a rune card's rendered content.
// A card caps images at 16rem tall (.card-content-image) so a photo or a diagram
// screenshot is often unreadable inline — tapping it opens this, which shows the
// image as large as the visible viewport allows.
//
// Closing: the backdrop, the X button, or Escape. Clicking the image ITSELF does
// nothing, so examining it (or pinch-zooming on a phone, where a stray tap lands
// on the image) never dismisses the preview by accident.
export default function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  // Portal to <body> so the fixed overlay isn't trapped by a transformed/clipping
  // ancestor — a card's face is an overflow-hidden scroll container, and the
  // preview may also be opened from inside a Modal (which portals the same way).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Escape closes. Modal doesn't bind Escape, so this can't race a parent dialog.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Pin --visible-vh to the real visible viewport so the overlay fills the screen
  // on mobile (Firefox Android reports a viewport it doesn't paint — see useAppHeight).
  useAppHeight();

  if (!mounted) return null;

  return createPortal(

    // BACKDROP — click anywhere outside the image to dismiss. stopPropagation is
    // NOT redundant despite the portal: React events bubble through the REACT
    // tree, not the DOM one, so a click here would otherwise still reach the
    // card face this preview was opened from — which on a study card's front is
    // "tap to reveal", flipping the card as the preview closed. Every click
    // inside the overlay passes through this handler, so it covers the subtree.
    <div
      className="card-image-lightbox"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Image preview"}
    >

      {/* CLOSE BUTTON */}
      <Button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="btn-link card-image-lightbox-close"
        title="Close preview"
      >
        <X className="w-6 h-6" />
      </Button>

      {/* FULL-SIZE IMAGE — stopPropagation so tapping the image doesn't close */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        className="card-image-lightbox-image"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
