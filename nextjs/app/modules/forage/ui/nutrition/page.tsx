// Forage nutrition breakdown route — a thin SERVER component that resolves the
// viewed day from the ?date= query (passed by the dashboard's Nutrition "See
// All" button) and hands it to the client. All fetching/rendering lives in
// NutritionClient.tsx ("use client").

import type { Metadata } from "next";

import NutritionClient from "./NutritionClient";

// Browser tab title for the nutrition route — overrides the root "Grimoire" title
// so the tab reads "Forage · Nutrition" while this page is open.
export const metadata: Metadata = {
  title: "Forage · Nutrition",
};

function serverTodayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default async function ForageNutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? "") ? params.date! : serverTodayIso();
  return <NutritionClient initialDate={date} />;
}
