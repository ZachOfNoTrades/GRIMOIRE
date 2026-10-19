"use client";

// Plays short, pleasant chimes using the Web Audio API (no audio assets to ship or
// fetch): a motif that reflects the evaluated rating, and the hands-free recording
// start and stop tones. Ratings follow the study UI's scale: 1=Again, 2=Hard,
// 3=Good, 4=Easy, and 0=Unscorable (garbled/empty).
// Best-effort — silently no-ops if Web Audio is unavailable or blocked.

let sharedContext: AudioContext | null = null;

// Lazily create (and resume) a single shared AudioContext. Reusing one context
// avoids the per-play allocation and the browser cap on live contexts.
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextCtor =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!sharedContext) sharedContext = new AudioContextCtor();
    // Autoplay policies suspend the context until a user gesture; evaluate is
    // click-triggered, so resuming here is enough to let the chime through.
    if (sharedContext.state === "suspended") sharedContext.resume().catch(() => {});
    return sharedContext;
  } catch {
    return null;
  }
}

// Each rating maps to a little arpeggio (frequencies in Hz). Lower/descending for
// worse recall, brighter/ascending for better — so the sound alone tells you how
// the answer landed.
const RATING_MOTIFS: Record<number, number[]> = {
  0: [440.0], // unscorable — single soft neutral note (A4)
  1: [392.0, 329.63], // again — gentle descending (G4 → E4)
  2: [440.0, 523.25], // hard — small rise (A4 → C5)
  3: [523.25, 659.25], // good — bright rising third (C5 → E5)
  4: [523.25, 659.25, 783.99], // easy — happy ascending triad (C5, E5, G5)
};

// Recording tones: rising when the mic opens, falling when it closes.
const RECORDING_MOTIFS = {
  start: [659.25, 880.0], // E5 → A5
  stop: [880.0, 659.25], // A5 → E5
};
const RECORDING_NOTE_SECONDS = 0.1;

export function playEvaluationChime(rating: number): void {
  const context = getAudioContext();
  if (!context) return;
  playNotes(context, RATING_MOTIFS[rating] ?? RATING_MOTIFS[0], 0.14);
}

// Play the hands-free recording start or stop tone. Resolves once the tone has
// finished and the audio output is suspended, to avoid playing audio while the mic
// is open: Firefox for Android then routes capture to a Bluetooth headset's
// hands-free mic (see audioRecorder.ts).
export async function playRecordingTone(kind: keyof typeof RECORDING_MOTIFS): Promise<void> {
  const context = getAudioContext();
  if (!context) return;
  try {
    await context.resume();
    const notes = RECORDING_MOTIFS[kind];
    playNotes(context, notes, RECORDING_NOTE_SECONDS);
    await new Promise((resolve) => setTimeout(resolve, (notes.length * RECORDING_NOTE_SECONDS + 0.05) * 1000));
    await context.suspend();
  } catch {
    // Web Audio blocked; the recording goes ahead without the tone
  }
}

// Schedule a sequence of soft sine notes, each noteDuration seconds long.
function playNotes(context: AudioContext, notes: number[], noteDuration: number): void {
  const startAt = context.currentTime;

  notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine"; // sine keeps it soft rather than a harsh beep
    oscillator.frequency.value = frequency;

    const noteStart = startAt + index * noteDuration;
    const noteEnd = noteStart + noteDuration;

    // Quick attack + exponential decay envelope so each note sounds plucked and pleasant.
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.15, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
}
