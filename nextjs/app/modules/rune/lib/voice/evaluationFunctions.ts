import { tmpdir } from "os";
import { getEvaluationPrompts } from "../settingsFunctions";
import { runEvalOnWorker } from "./evalWorker";
import { generate, extractJson, usesOpenRouter } from "@/lib/llm/generate";
import { recordUsage } from "@/lib/llm/usage";

export interface EvaluationResult {
  correct: boolean;
  // 0=Skip (bad input — garbled transcription, unrelated, empty; not a genuine
  // attempt, so the card should be skipped and re-asked rather than scored),
  // 1=Again, 2=Hard, 3=Good, 4=Easy.
  suggestedRating: number;
  explanation: string;
}

/**
 * Evaluate a user's spoken answer against the expected answer.
 *
 * The backend is the user's choice for the `rune_eval` task (Settings → AI): on
 * OpenRouter it is one stateless request with the user's key; on the shared Claude
 * CLI it runs on the persistent per-session worker when one is given (warmed at
 * study-session start), else a one-shot CLI call. A worker error falls back to the
 * one-shot CLI call — same backend, so a worker problem never blocks grading.
 */
export async function evaluateAnswer(
  userId: string,
  question: string,
  expectedAnswer: string,
  userAnswer: string,
  notes: string | null,
  sessionKey?: string | null
): Promise<EvaluationResult> {
  const { systemPrompt, personalityPrompt } = await getEvaluationPrompts(userId);
  const fill = (template: string) => template
    .replace("{{QUESTION}}", question)
    .replace("{{EXPECTED_ANSWER}}", expectedAnswer)
    .replace("{{NOTES}}", notes || "None")
    .replace("{{USER_ANSWER}}", userAnswer);
  const prompt = `${fill(systemPrompt)}\n\n${fill(personalityPrompt)}`;

  console.log(`[Evaluate] Question: '${question}'`);
  console.log(`[Evaluate] Expected: '${expectedAnswer}'`);
  console.log(`[Evaluate] User said: '${userAnswer}'`);

  let responseText: string;
  if (sessionKey && !(await usesOpenRouter(userId, "rune_eval"))) {
    const started = Date.now();
    try {
      responseText = await runEvalOnWorker(sessionKey, prompt);
      // The worker's stream-json result line carries no per-turn cost, so the row
      // records the call and its latency only.
      recordUsage({ userId, task: "rune_eval", backend: "claude", model: "claude-cli:worker", promptTokens: 0, completionTokens: 0, costUsd: null, durationMs: Date.now() - started, ok: true, errorCode: null });
    } catch (error) {
      console.warn(`[Evaluate] Worker failed, falling back to one-shot CLI call: ${error instanceof Error ? error.message : error}`);
      responseText = await callOneShot(userId, prompt);
    }
  } else {
    responseText = await callOneShot(userId, prompt);
  }
  console.log(`[Evaluate] Model response: ${responseText}`);

  return parseEvaluation(responseText);
}

// One request on whichever backend the user chose. The CLI flags match the warm
// worker (model + effort, no MCP, neutral cwd) so a fallback grades identically.
async function callOneShot(userId: string, prompt: string): Promise<string> {
  const result = await generate(userId, "rune_eval", {
    prompt,
    json: true,
    timeoutMs: 30000,
    cli: { cwd: tmpdir(), shell: true },
  });
  return result.text;
}

/** Parse the model's JSON response (may be wrapped in markdown fences) into an EvaluationResult. */
function parseEvaluation(responseText: string): EvaluationResult {
  const parsed = extractJson(responseText) as { correct?: unknown; suggested_rating?: unknown; explanation?: unknown };

  const result: EvaluationResult = {
    correct: Boolean(parsed.correct),
    suggestedRating: typeof parsed.suggested_rating === "number" ? parsed.suggested_rating : 0,
    // Easy answers intentionally return no explanation — coerce any missing/non-string value to "".
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
  };

  console.log(`[Evaluate] Result: correct=${result.correct}, rating=${result.suggestedRating}, explanation='${result.explanation}'`);

  return result;
}
