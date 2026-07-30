// Scale per-serving macros to an entry's logged quantity. The serving row says
// "1 serving = unitsPerServing of this unit", so servings_eaten = quantity / unitsPerServing
// and macros = servings_eaten × per-serving macros.
export function scaleMacros(
  perServing: { kcal: number; protein_g: number; carbs_g: number; fat_g: number },
  quantity: number,
  unitsPerServing: number | null
): { kcal: number; protein_g: number; carbs_g: number; fat_g: number } {
  const ups = unitsPerServing && unitsPerServing > 0 ? unitsPerServing : 1;
  const servings = quantity / ups;
  return {
    kcal: perServing.kcal * servings,
    protein_g: perServing.protein_g * servings,
    carbs_g: perServing.carbs_g * servings,
    fat_g: perServing.fat_g * servings,
  };
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
