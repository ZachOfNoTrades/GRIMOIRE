// Forage per-nutrient detail route — a thin SERVER component that resolves the
// nutrient from the ?code path segment (the code carried by every nutrition row
// and dashboard nutrient card) and hands it to the client editor. 404s on an
// unknown code. All fetching/editing lives in NutrientDetailClient.tsx.

import { notFound } from "next/navigation";
import { getNutrientByCode } from "../../../lib/nutrientFunctions";
import NutrientDetailClient from "./NutrientDetailClient";

export default async function ForageNutrientDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const nutrient = await getNutrientByCode(decodeURIComponent(code));
  if (!nutrient) notFound();
  return <NutrientDetailClient nutrient={nutrient} />;
}
