// Read the containers a request body sends, leaving a body without a list as undefined so a save keeps the food's containers
export function parseContainerList(value: unknown): { name: string; servings_per_container: number }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((c: any) => c && typeof c.name === 'string' && c.name.trim() && Number(c.servings_per_container) > 0)
    .map((c: any) => ({ name: c.name.trim(), servings_per_container: Number(c.servings_per_container) }));
}
