"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ImageOff } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { preloadImage, getCachedImageDimensions, type ImageDimensions } from "../lib/imagePreload";

interface CardContentProps {
  text: string;
  className?: string;
}

// Videos are embedded with the same markdown image syntax (`![](url)`) as
// images — the on-disk extension is what distinguishes them (see the rune
// upload pipeline). Matches the extensions in ALLOWED_VIDEO_TYPES, tolerating a
// trailing query string.
function isVideoUrl(src?: string): boolean {
  return !!src && /\.(mp4|webm|mov|ogv)(\?.*)?$/i.test(src);
}

// Renders an embedded video clip. `preload="metadata"` fetches only the header
// (dimensions/duration) up front, not the whole file, and the auth-gated serve
// route answers Range requests so scrubbing works. <video> is embedded/phrasing
// content, so it stays valid inside the <p> markdown wraps a standalone image in.
function MarkdownVideo({ src }: { src?: string }) {
  if (!src) return null;
  return <video src={src} controls preload="metadata" className="card-content-video" />;
}

// Loads an image fully off-screen before ever rendering an <img> tag, so the
// study view never paints a partially-downloaded (e.g. progressive JPEG)
// image — a sized placeholder holds its place until the load event confirms
// the image is 100% loaded, then the real <img> swaps in (already cached, so
// the swap is instant).
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Seed from the shared cache so a card reached via the study look-ahead buffer
  // (which already preloaded + measured the image) reserves the right box on the
  // very first paint — no fixed-placeholder → image size jump.
  const [dimensions, setDimensions] = useState<ImageDimensions | undefined>(() => getCachedImageDimensions(src));

  useEffect(() => {
    if (!src) { setStatus("error"); return; }
    const cached = getCachedImageDimensions(src);
    setDimensions(cached);
    // Already fully cached (e.g. buffered ahead)? Skip straight to the real <img>.
    if (cached) { setStatus("loaded"); return; }

    setStatus("loading");
    let cancelled = false;
    // Reuse the shared preloader so it fills the dimension cache for other cards too.
    preloadImage(src).then((dims) => {
      if (cancelled) return;
      if (dims) { setDimensions(dims); setStatus("loaded"); }
      else setStatus("error");
    });
    return () => { cancelled = true; };
  }, [src]);

  if (status === "loaded") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt || ""} className="card-content-image" />;
  }

  // When we know the image's natural size, reserve a box with the same aspect
  // ratio and caps (max-width 100%, max-height 16rem) that .card-content-image
  // uses, so the swap-in is a no-op layout-wise. Otherwise fall back to the CSS
  // default fixed-height placeholder.
  const sizedStyle: CSSProperties | undefined = dimensions
    ? { width: `${dimensions.width}px`, aspectRatio: `${dimensions.width} / ${dimensions.height}`, height: "auto", maxWidth: "100%", maxHeight: "16rem" }
    : undefined;

  // Markdown wraps a standalone image in a <p>, and <p> only permits inline
  // (phrasing) content — a <div> placeholder here would force the browser to
  // implicitly close the <p> early and cause a hydration mismatch. Stick to
  // <span>/<svg> so this stays valid nested inside <p>.
  return (
    <span className="card-content-image-placeholder" style={sizedStyle}>
      {status === "error" ? <ImageOff className="w-5 h-5" /> : <span className="card-content-image-spinner" />}
    </span>
  );
}

// Renders rune card front/back/notes text as markdown, supporting inline
// images and videos (both `![alt](url)`, distinguished by file extension) and
// basic GFM formatting (bold, lists, tables, links). Raw HTML is never passed
// through, so this stays safe for LLM-generated or refined content.
export default function CardContent({ text, className }: CardContentProps) {
  return (
    <div className={`card-content-markdown ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => {
            const url = typeof src === "string" ? src : undefined;
            return isVideoUrl(url) ? <MarkdownVideo src={url} /> : <MarkdownImage src={url} alt={alt} />;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
