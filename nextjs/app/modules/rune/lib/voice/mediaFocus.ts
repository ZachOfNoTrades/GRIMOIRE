// MEDIA FOCUS HOLD — pauses other apps' media (music, podcasts) while Rune is speaking
// or listening. Firefox for Android takes Android audio focus only for AUDIBLE page
// media, never for getUserMedia, so a page that just records leaves the user's music playing over
// their answer. Playing a looping 20 Hz tone at -48 dBFS makes Firefox take focus
// (measured on Firefox Android: a 0.001-amplitude tone takes focus, 0.0001 does not)
// while staying far below hearing on phone speakers and earbuds.

const RATE = 16000;   // an 8 kHz tone at the same level lost focus after resampling
const SECONDS = 4;       // looped; Firefox ignores media shorter than ~3 s for focus
const FREQ_HZ = 20;
const AMPLITUDE = 0.004; // -48 dBFS: 4x the measured threshold, still far below hearing at 20 Hz

let toneUrl: string | null = null;

function toneWavUrl(): string {
  if (toneUrl) return toneUrl;
  const samples = RATE * SECONDS;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  // A whole number of cycles per loop, so the seam is continuous.
  for (let i = 0; i < samples; i++) {
    view.setInt16(44 + i * 2, Math.round(AMPLITUDE * 32767 * Math.sin((2 * Math.PI * FREQ_HZ * i) / RATE)), true);
  }
  toneUrl = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  return toneUrl;
}

/** Start holding focus; returns the release function. Never throws. */
export function holdMediaFocus(): () => void {
  let element: HTMLAudioElement | null = null;
  try {
    element = new Audio(toneWavUrl());
    element.loop = true;
    element.play().catch((error) => console.warn("Media focus hold didn't start:", error));
    // The phone's media notification names what is "playing".
    if ("mediaSession" in navigator && "MediaMetadata" in window) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: "Hands-free", artist: "Rune" });
    }
  } catch (error) {
    console.warn("Media focus hold didn't start:", error);
  }
  return () => {
    if (!element) return;
    element.pause();
    element.removeAttribute("src");
    element.load();
    element = null;
  };
}
