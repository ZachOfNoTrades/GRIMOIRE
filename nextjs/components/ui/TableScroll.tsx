"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Wrap a table in a box that scrolls sideways, showing an arrow on each side that holds more columns
export default function TableScroll({ children }: { children: ReactNode }) {

  // STATE
  const [hasMoreLeft, setHasMoreLeft] = useState(false);
  const [hasMoreRight, setHasMoreRight] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);

  // Show each arrow while there is more to scroll that way, rechecking on scroll and on resize
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      setHasMoreLeft(scroller.scrollLeft > 1);
      setHasMoreRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="table-scroll">

      {/* TABLE BOX */}
      <div ref={scrollerRef} className="table-container">
        {children}
      </div>

      {/* MORE LEFT */}
      {hasMoreLeft && (
        <div className="table-scroll-more table-scroll-more-left" aria-hidden="true">
          <ChevronLeft className="w-4 h-4" />
        </div>
      )}

      {/* MORE RIGHT */}
      {hasMoreRight && (
        <div className="table-scroll-more table-scroll-more-right" aria-hidden="true">
          <ChevronRight className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
