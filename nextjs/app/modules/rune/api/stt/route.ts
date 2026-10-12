import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/permissions";
import { transcribeAudio, SttSupersededError } from "../../lib/voice/sttFunctions";
import { LlmBackendError } from "@/lib/llm/types";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedUser(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      );
    }

    // Convert File to Buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Recorder diagnostics (device label/settings, rates, noise floor) — logged with
    // the outcome so a misbehaving input device can be told apart from the server.
    const rawDiag = formData.get("diag");
    const diag = typeof rawDiag === "string" ? rawDiag.slice(0, 2000) : "-";
    // Byte rate from the WAV header (recordings carry the device's own rate).
    const byteRate = audioBuffer.length >= 44 ? audioBuffer.readUInt32LE(28) : 0;
    const wavSeconds = byteRate > 0 ? Math.max(0, audioBuffer.length - 44) / byteRate : 0;
    const started = Date.now();
    try {
      const transcript = await transcribeAudio(session.user.id!, audioBuffer);
      console.log(`[stt] ok user=${session.user.id} bytes=${audioBuffer.length} wav=${wavSeconds.toFixed(1)}s ms=${Date.now() - started} chars=${transcript.length} diag=${diag}`);
      return NextResponse.json({ transcript }, { status: 200 });
    } catch (error) {
      console.error(`[stt] failed user=${session.user.id} bytes=${audioBuffer.length} wav=${wavSeconds.toFixed(1)}s ms=${Date.now() - started} diag=${diag}`);
      throw error;
    }

  } catch (error) {
    // A queued run dropped for a newer recording from the same user: not an error.
    if (error instanceof SttSupersededError) {
      return NextResponse.json({ error: error.message, code: "superseded" }, { status: 409 });
    }
    // OpenRouter backend failures (no key, out of credits…) keep their status and code.
    if (error instanceof LlmBackendError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Error in POST /modules/rune/api/stt:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "STT transcription failed" },
      { status: 500 }
    );
  }
}
