import type { Metadata } from "next";

// Browser tab title for the food logger route. The page itself
// (ForageFoodLogPage) is a client component, so it can't export `metadata`;
// this thin server layout sets the title instead — overriding the root
// "Grimoire" title so the tab reads "Forage · Logger" while logging food.
export const metadata: Metadata = {
  title: "Forage · Logger",
};

export default function ForageFoodLogLayout({ children }: { children: React.ReactNode }) {
  // LAYOUT PASS-THROUGH — exists solely to carry the route metadata above.
  return <>{children}</>;
}
