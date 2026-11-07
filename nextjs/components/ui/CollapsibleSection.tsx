"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "./button";

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
}

// Show a page section whose body opens from its heading, for detail most visits skip
export default function CollapsibleSection({ title, children }: CollapsibleSectionProps) {
  const bodyId = useId();
  const [isOpen, setIsOpen] = useState(false);

  return (

    // SECTION
    <section className="collapse-section">

      {/* SECTION TOGGLE */}
      <Button type="button" className="collapse-head" aria-expanded={isOpen} aria-controls={bodyId} onClick={() => setIsOpen((open) => !open)}>
        <ChevronRight className="w-5 h-5 collapse-chev" aria-hidden />
        <span className="collapse-title">{title}</span>
      </Button>

      {/* SECTION BODY */}
      <div id={bodyId} className="collapse-body" hidden={!isOpen}>
        {children}
      </div>
    </section>
  );
}
