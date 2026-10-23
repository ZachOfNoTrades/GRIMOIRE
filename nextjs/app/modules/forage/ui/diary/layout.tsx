import type { Metadata } from "next";

// Browser tab title for the diary route. The page itself
// (ForageDiaryPage) is a client component, so it can't export `metadata`;
// this thin server layout sets the title instead — overriding the root
// "Grimoire" title so the tab reads "Forage · Diary" on the diary.
export const metadata: Metadata = {
  title: "Forage · Diary",
};

export default function ForageDiaryLayout({ children }: { children: React.ReactNode }) {
  // LAYOUT PASS-THROUGH — exists solely to carry the route metadata above.
  return <>{children}</>;
}
