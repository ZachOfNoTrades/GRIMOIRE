// Forage insight detail route — one page per dashboard Insights card
// (expenditure, weight-trend, energy-balance, goal). A thin SERVER component
// that validates the metric slug and hands it to the client; all fetching and
// rendering lives in InsightDetailClient.tsx.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { INSIGHT_METRICS, InsightMetric } from "../../../types/insights";
import InsightDetailClient from "./InsightDetailClient";

const TAB_TITLES: Record<InsightMetric, string> = {
  expenditure: "Expenditure",
  "weight-trend": "Weight Trend",
  "energy-balance": "Energy Balance",
  goal: "Goal",
};

export async function generateMetadata({ params }: { params: Promise<{ metric: string }> }): Promise<Metadata> {
  const { metric } = await params;
  const known = (INSIGHT_METRICS as string[]).includes(metric);
  return { title: `Forage · ${known ? TAB_TITLES[metric as InsightMetric] : "Insights"}` };
}

export default async function ForageInsightDetailPage({ params }: { params: Promise<{ metric: string }> }) {
  const { metric } = await params;
  if (!(INSIGHT_METRICS as string[]).includes(metric)) notFound();
  return <InsightDetailClient metric={metric as InsightMetric} />;
}
