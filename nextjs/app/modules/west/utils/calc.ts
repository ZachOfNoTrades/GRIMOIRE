// Calculate estimated 1RM using the Epley formula: weight × (1 + reps / 30)
export function calculateEstimatedOneRepMax(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}
