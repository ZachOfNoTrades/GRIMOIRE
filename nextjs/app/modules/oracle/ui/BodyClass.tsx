"use client";

import { useEffect } from "react";

// Marks the document while an Oracle page is open, so rules can reach parts rendered outside the
// page's own tree (modals portal to the body).
export default function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}
