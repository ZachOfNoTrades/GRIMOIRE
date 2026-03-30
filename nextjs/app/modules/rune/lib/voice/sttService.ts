export class SpeechToTextService {
  /** Send audio WAV blob to the server-side Whisper API and return the transcript. */
  async transcribe(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.wav");

    const response = await fetch("/modules/rune/api/stt", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "STT transcription failed");
    }

    const data = await response.json();
    return data.transcript;
  }
}
