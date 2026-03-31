import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSession } from "@/lib/permissions";
import { transcribeAudio } from "../../lib/voice/sttFunctions";

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
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

    const transcript = await transcribeAudio(audioBuffer);

    return NextResponse.json({ transcript }, { status: 200 });

  } catch (error) {
    console.error("Error in POST /modules/rune/api/stt:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "STT transcription failed" },
      { status: 500 }
    );
  }
}
