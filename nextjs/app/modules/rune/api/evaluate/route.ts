import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { evaluateAnswer } from "../../lib/voice/evaluationFunctions";
import { warmWorker, disposeWorker } from "../../lib/voice/evalWorker";
import { warmSynthesizer } from "../../lib/voice/ttsFunctions";

// Per-session worker keys are namespaced by the authenticated user so one user's
// key can never address another user's worker.
const workerKey = (userId: string, sessionKey: string) => `${userId}:${sessionKey}`;

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id!;

    const body = await request.json();
    const { question, expectedAnswer, userAnswer, notes, sessionKey, warm, dispose } = body;

    // Lifecycle actions (no eval): pre-warm a session worker, or tear it down.
    if (warm && sessionKey) {
      warmWorker(workerKey(userId, sessionKey)); // fire-and-forget; startup hides behind card 1 TTS
      // Study start is also the right moment to load the Piper voice, so the first
      // spoken explanation doesn't pay the model load on the critical path.
      warmSynthesizer();
      return NextResponse.json({ warming: true }, { status: 200 });
    }
    if (dispose && sessionKey) {
      disposeWorker(workerKey(userId, sessionKey));
      return NextResponse.json({ disposed: true }, { status: 200 });
    }

    if (!question || !expectedAnswer || !userAnswer) {
      return NextResponse.json(
        { error: "question, expectedAnswer, and userAnswer are required" },
        { status: 400 }
      );
    }

    const result = await evaluateAnswer(
      userId,
      question,
      expectedAnswer,
      userAnswer,
      notes ?? null,
      sessionKey ? workerKey(userId, sessionKey) : null
    );

    return NextResponse.json(result, { status: 200 });

  } catch (error) {
    console.error("Error in POST /modules/rune/api/evaluate:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed", fallback: true },
      { status: 500 }
    );
  }
}
