/**
 * Forage's module icon — an ink-drawing tree. The PNG is used purely as a CSS alpha mask, so the
 * glyph is painted in `currentColor` exactly like a Lucide icon: one asset covers both themes and
 * picks up hover colours for free.
 */
export default function ForageTreeIcon({ className }: { className?: string }) {
  return (
    // ICON
    <span aria-hidden="true" className={`icon-mask icon-mask-forage-tree${className ? ` ${className}` : ""}`} />
  );
}
