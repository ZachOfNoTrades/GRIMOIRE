import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { evaluateAnswer } from "../../lib/voice/evaluationFunctions";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { question, expectedAnswer, userAnswer, notes } = body;

    if (!question || !expectedAnswer || !userAnswer) {
      return NextResponse.json(
        { error: "question, expectedAnswer, and userAnswer are required" },
        { status: 400 }
      );
    }

    const result = await evaluateAnswer(question, expectedAnswer, userAnswer, notes ?? null);

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error("Error in POST /modules/rune/api/evaluate:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed", fallback: true },
      { status: 500 }
    );
  }
}
