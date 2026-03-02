// Round weight to nearest 5 lbs
export function round5(weight: number): number {
  return Math.round(weight / 5) * 5;
}

// Calculate estimated 1RM using the Epley formula: weight × (1 + reps / 30)
export function calculateEstimatedOneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}

// Calculate block week split for a powerlifting program
export function calculateBlockSplit(totalWeeks: number): { hypertrophyWeeks: number; strengthWeeks: number; peakingWeeks: number } {
  if (totalWeeks < 1) {
    return { hypertrophyWeeks: 0, strengthWeeks: 0, peakingWeeks: 0 };
  }

  // Short programs (1-3 weeks): peaking only
  if (totalWeeks <= 3) {
    return { hypertrophyWeeks: 0, strengthWeeks: 0, peakingWeeks: totalWeeks };
  }

  // Medium-short programs (4-7 weeks): strength + peaking
  if (totalWeeks <= 7) {
    const peakingWeeks = Math.max(2, Math.round(totalWeeks * 0.40));
    const strengthWeeks = totalWeeks - peakingWeeks;
    return { hypertrophyWeeks: 0, strengthWeeks, peakingWeeks };
  }

  // Standard programs (8+ weeks): hypertrophy + strength + peaking
  let hypertrophyWeeks = Math.round(totalWeeks * 0.50);
  let strengthWeeks = Math.round(totalWeeks * 0.30);
  let peakingWeeks = totalWeeks - hypertrophyWeeks - strengthWeeks;

  // Enforce minimums: hyp >= 4, str >= 2, peak >= 2
  const minimums = [
    { key: 'hyp', min: 4, get: () => hypertrophyWeeks, set: (v: number) => { hypertrophyWeeks = v; } },
    { key: 'str', min: 2, get: () => strengthWeeks, set: (v: number) => { strengthWeeks = v; } },
    { key: 'peak', min: 2, get: () => peakingWeeks, set: (v: number) => { peakingWeeks = v; } },
  ];

  // If any block is below its minimum, steal from the largest block
  for (const entry of minimums) {
    while (entry.get() < entry.min) {
      const largest = minimums
        .filter(m => m.key !== entry.key && m.get() > m.min)
        .sort((a, b) => b.get() - a.get())[0];

      if (!largest) break; // Cannot satisfy minimums
      largest.set(largest.get() - 1);
      entry.set(entry.get() + 1);
    }
  }

  return { hypertrophyWeeks, strengthWeeks, peakingWeeks };
}
