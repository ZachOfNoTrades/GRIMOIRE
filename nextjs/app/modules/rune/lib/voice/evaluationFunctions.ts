import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, existsSync } from "fs";
import { getEvaluationPrompts } from "../settingsFunctions";
import { runEvalOnWorker } from "./evalWorker";

// Empty MCP config so the CLI skips connecting to MCP servers (the grimoire MCP
// connection alone adds ~2-3s of startup per spawn). Written once, passed by path
// to avoid shell-quoting a JSON literal.
const EMPTY_MCP_CONFIG_PATH = join(tmpdir(), "rune-eval-empty-mcp.json");
function ensureEmptyMcpConfig(): string {
  if (!existsSync(EMPTY_MCP_CONFIG_PATH)) {
    writeFileSync(EMPTY_MCP_CONFIG_PATH, '{"mcpServers":{}}');
  }
  return EMPTY_MCP_CONFIG_PATH;
}

export interface EvaluationResult {
  correct: boolean;
  // 0=Skip (bad input — garbled transcription, unrelated, empty; not a genuine
  // attempt, so the card should be skipped and re-asked rather than scored),
  // 1=Again, 2=Hard, 3=Good, 4=Easy.
  suggestedRating: number;
  explanation: string;
}

/**
 * Evaluate a user's spoken answer against the expected answer using Claude Code CLI.
 * Returns an EvaluationResult with correctness, suggested rating, and explanation.
 */
export async function evaluateAnswer(
  userId: string,
  question: string,
  expectedAnswer: string,
  userAnswer: string,
  notes: string | null,
  // When provided, the eval runs on a persistent per-session worker (warmed at
  // study-session start) instead of a cold one-shot spawn — removing ~3s of CLI
  // startup from the critical path. Falls back to a one-shot spawn if the worker
  // errors, so a worker problem never blocks grading.
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
  if (sessionKey) {
    try {
      responseText = await runEvalOnWorker(sessionKey, prompt);
    } catch (error) {
      console.warn(`[Evaluate] Worker failed, falling back to one-shot spawn: ${error instanceof Error ? error.message : error}`);
      responseText = await callClaude(prompt);
    }
  } else {
    responseText = await callClaude(prompt);
  }
  console.log(`[Evaluate] Claude response: ${responseText}`);

  return parseEvaluation(responseText);
}

/** Parse the model's JSON response (may be wrapped in markdown fences) into an EvaluationResult. */
function parseEvaluation(responseText: string): EvaluationResult {
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse evaluation response as JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  const result: EvaluationResult = {
    correct: Boolean(parsed.correct),
    suggestedRating: typeof parsed.suggested_rating === "number" ? parsed.suggested_rating : 0,
    // Easy answers intentionally return no explanation — coerce any missing/non-string value to "".
    explanation: typeof parsed.explanation === "string" ? parsed.explanation : "",
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
        // Skip MCP server connections — biggest per-spawn startup cost (~2-3s).
        "--strict-mcp-config",
        "--mcp-config", ensureEmptyMcpConfig(),
        // opus benchmarks fastest here (~7s) and correctly emits the blank Easy explanation;
        // haiku is slowest locally (~12s), so keep opus.
        "--model", "opus",
      ],
      {
        timeout: 30000,
        shell: true,
        // Neutral cwd so the CLI doesn't load the large grimoire project CLAUDE.md (~1s).
        cwd: tmpdir(),
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
