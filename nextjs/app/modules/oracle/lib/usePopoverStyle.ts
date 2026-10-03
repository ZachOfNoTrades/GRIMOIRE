import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

// Where a popover opens: fixed under its trigger, kept inside the screen. A fixed popover takes no
// part in its container's overflow, so it cannot widen a toolbar on a phone.
export function usePopoverStyle(trigger: RefObject<HTMLElement | null>, isOpen: boolean, align: "left" | "right"): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();
  useLayoutEffect(() => {
    if (!isOpen || !trigger.current) return;
    const box = trigger.current.getBoundingClientRect();
    const margin = 8;
    const maxWidth = window.innerWidth - margin * 2;
    if (window.innerWidth < 640) {
      setStyle({ position: "fixed", top: box.bottom + 4, left: margin, right: margin, width: "auto" });
      return;
    }
    setStyle(
      align === "left"
        ? { position: "fixed", top: box.bottom + 4, left: Math.max(margin, Math.min(box.left, window.innerWidth - margin - 224)), maxWidth }
        : { position: "fixed", top: box.bottom + 4, right: Math.max(margin, window.innerWidth - box.right), maxWidth }
    );
  }, [trigger, isOpen, align]);
  return isOpen ? style : undefined;
}
