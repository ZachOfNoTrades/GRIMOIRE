"use client";

import { ImageOff } from "lucide-react";
import type { CSSProperties } from "react";
import { usePictureSize } from "../lib/imagePreload";

interface PictureProps {
  src: string | null;
  alt: string;
  className?: string;
  /** Drawn while there is no picture at all, rather than an empty box. */
  empty?: React.ReactNode;
}

// A picture that keeps its own place. Nothing is drawn until the file has loaded; until then a box
// of the same shape holds the space, so the panel around it never jumps when the picture arrives.
export default function Picture({ src, alt, className, empty }: PictureProps) {
  const size = usePictureSize(src);

  if (!src) return <>{empty ?? null}</>;

  if (!size) {
    // The shape is only known once the file's header has been read, so before that the box falls
    // back to the square a portrait is generated at.
    const shape: CSSProperties = { aspectRatio: "1 / 1" };
    return (
      <span className={`orc-picture-waiting ${className ?? ""}`} style={shape} aria-label={alt} role="img">
        <span className="orc-picture-spinner" aria-hidden />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={src} alt={alt} width={size.width} height={size.height} />
  );
}

/** The same box, for a picture that could not be loaded. */
export function PictureMissing({ className }: { className?: string }) {
  return (
    <span className={`orc-picture-waiting ${className ?? ""}`} style={{ aspectRatio: "1 / 1" }}>
      <ImageOff className="w-5 h-5" aria-hidden />
    </span>
  );
}
