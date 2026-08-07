"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface PopoverMenuProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  align?: "left" | "right"; // which edge of the anchor the menu's edge lines up with
  className?: string; // extra classes on the menu itself (e.g. .popover-menu--wide)
  children: React.ReactNode;
}

// Renders `.popover-menu` content through a portal to <body>, positioned from
// the anchor's live viewport rect (position: fixed) instead of the usual
// `position: absolute` inside the trigger's own DOM subtree. An absolutely
// positioned popover is still clipped by any ancestor with `overflow: hidden`
// /`auto` (a modal-body, an accordion mid-collapse-animation, a scrolling
// table) no matter its z-index — z-index only reorders paint within a
// stacking context, it doesn't escape an ancestor's overflow clip. Portaling
// to <body> removes it from that subtree entirely, so it can never be
// clipped by where its trigger happens to live.
export default function PopoverMenu({ open, onClose, anchorRef, align = "right", className, children }: PopoverMenuProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Reposition against the anchor's real rect. Runs before paint (layout
  // effect), so the off-screen fallback position/visibility below never
  // flashes on screen.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }

    const reposition = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const a = anchor.getBoundingClientRect();
      const menuHeight = menu.offsetHeight;
      const menuWidth = menu.offsetWidth;
      const up = window.innerHeight - a.bottom < menuHeight + 8 && a.top - menuHeight - 8 > 0;
      setOpenUp(up);
      setPos({
        top: up ? a.top - menuHeight - 4 : a.bottom + 4,
        left: align === "right" ? a.right - menuWidth : a.left,
      });
    };

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, anchorRef, align]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, anchorRef]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`popover-menu ${openUp ? "popover-menu-up" : ""}${className ? ` ${className}` : ""}`}
      style={{
        position: "fixed",
        top: pos ? pos.top : -9999,
        left: pos ? pos.left : -9999,
        right: "auto",
        bottom: "auto",
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
