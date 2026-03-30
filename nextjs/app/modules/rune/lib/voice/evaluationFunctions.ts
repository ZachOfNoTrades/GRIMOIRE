import { spawn } from "child_process";
import { loadPromptFile } from "../promptLoader";

export interface EvaluationResult {
  correct: boolean;
  suggestedRating: number; // 1=Again, 2=Hard, 3=Good, 4=Easy
  explanation: string;
}

/**
 * Evaluate a user's spoken answer against the expected answer using Claude Code CLI.
 * Returns an EvaluationResult with correctness, suggested rating, and explanation.
 */
export async function evaluateAnswer(
  question: string,
  expectedAnswer: string,
  userAnswer: string,
  notes: string | null
): Promise<EvaluationResult> {
  const prompt = loadPromptFile("evaluateAnswer.md")
    .replace("{{QUESTION}}", question)
    .replace("{{EXPECTED_ANSWER}}", expectedAnswer)
    .replace("{{NOTES}}", notes || "None")
    .replace("{{USER_ANSWER}}", userAnswer);

  console.log(`[Evaluate] Question: '${question}'`);
  console.log(`[Evaluate] Expected: '${expectedAnswer}'`);
  console.log(`[Evaluate] User said: '${userAnswer}'`);

  const responseText = await callClaude(prompt);
  console.log(`[Evaluate] Claude response: ${responseText}`);

  // Parse JSON from response (may be wrapped in markdown fences)
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse evaluation response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const result: EvaluationResult = {
    correct: parsed.correct,
    suggestedRating: parsed.suggested_rating,
    explanation: parsed.explanation,
  };

  console.log(`[Evaluate] Result: correct=${result.correct}, rating=${result.suggestedRating}, explanation='${result.explanation}'`);

  return result;
}

/** Spawn Claude CLI with no tools, pipe prompt via stdin, read stdout. */
function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      [
        "-p",
        "--output-format", "text",
        "--no-session-persistence",
      ],
      {
        timeout: 30000,
        shell: true,
        env: { ...process.env },
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (error) => {
      reject(new Error(`Claude CLI error: ${error.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
      }
    });

    console.log("[Evaluate] Spawning Claude CLI...");
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
