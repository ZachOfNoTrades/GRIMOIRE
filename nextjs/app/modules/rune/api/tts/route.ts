import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { synthesizeSpeech } from "../../lib/voice/ttsFunctions";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { text } = body;

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    const audioData = await synthesizeSpeech(text);

    return NextResponse.json({ audioData }, { status: 200 });

  } catch (error) {
    console.error("Error in POST /modules/rune/api/tts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS generation failed" },
      { status: 500 }
    );
  }
}
