// Punctuation nobody types when searching. The store "H-E-B" gets typed "heb",
// "Ben & Jerry's" as "ben jerrys", "Reserve Turkey Breast, Cracked Peppercorn"
// as "turkey peppercorn". These characters are stripped from BOTH sides of the
// comparison so punctuation can never block a match. Whitespace is deliberately
// NOT stripped — collapsing it would let "heb" match "the best".
export const SEARCH_IGNORED_CHARS = ['-', '.', ',', "'", '’', '&', '/', '(', ')', '+', '*', '"'];

// Drop the ignored punctuation from a search term or a value being searched.
// Client-safe on purpose (no mssql import): the server-side food/recipe queries
// and the recipes page's in-memory filter must normalize identically, or the
// same query would return different results depending on which one ran.
export function normalizeSearchTerm(value: string): string {
  let normalized = value;
  for (const character of SEARCH_IGNORED_CHARS) normalized = normalized.split(character).join('');
  return normalized;
}
