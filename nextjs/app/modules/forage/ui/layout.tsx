import ForageViewportSync from "./ForageViewportSync";

export default function ForageLayout({ children }: { children: React.ReactNode }) {
  /* Module layout is a pass-through; forage navigation lives in the global nav
     drawer (no module-specific menu). ForageViewportSync renders nothing — it
     just pins --app-height for every forage page (mobile viewport fix). */
  return (
    <>
      {children}
      <ForageViewportSync />
    </>
  );
}
