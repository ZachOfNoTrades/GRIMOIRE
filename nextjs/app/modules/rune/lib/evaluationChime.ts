"use client";

// Plays a short, pleasant chime whose motif reflects the evaluated rating, using
// the Web Audio API (no audio assets to ship or fetch). Ratings follow the study
// UI's scale: 1=Again, 2=Hard, 3=Good, 4=Easy, and 0=Unscorable (garbled/empty).
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

export function playEvaluationChime(rating: number): void {
  const context = getAudioContext();
  if (!context) return;

  const notes = RATING_MOTIFS[rating] ?? RATING_MOTIFS[0];
  const noteDuration = 0.14; // seconds per note
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
