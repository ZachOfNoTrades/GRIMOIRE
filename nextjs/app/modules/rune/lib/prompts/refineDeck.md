Refine an existing set of flash cards based on user feedback. Apply the feedback to modify, add, or remove cards as appropriate.

## User Feedback

{{FEEDBACK}}

## Existing Cards

Each card has an `id` field. You MUST preserve the `id` for any card you keep or modify. Only omit the `id` (set to `null`) for brand new cards you are adding.

Cards that you omit entirely from your output will be deleted.

```json
{{EXISTING_CARDS}}
```

## Source Content

If source content is provided below, use it as reference material — especially if the feedback asks to re-read or refresh from the source.

{{SOURCE_CONTENT}}

## Target Deck

- Deck ID: `{{DECK_ID}}`
- Deck Name: {{DECK_NAME}}

## Schema

```typescript
interface RefinedCard {
  id: string | null; // existing card ID to keep/update, or null for new cards
  front: string;     // Question, prompt, or term
  back: string;      // Answer
  notes: string | null; // Optional extra context, mnemonics, or hints
}

interface RefineDeckPayload {
  cards: RefinedCard[];
}
```

## Rules

1. The file must be a single JSON object matching `RefineDeckPayload` — nothing else.
2. Preserve the `id` of every card you keep or modify. Setting `id` to `null` means it is a new card.
3. To delete a card, simply omit it from the output.
4. Apply the user's feedback faithfully. If they ask to remove certain topics, remove them. If they ask to rephrase, rephrase all relevant cards.
5. Do not invent new cards unless the feedback specifically asks for additions or the source content contains uncovered material.
6. Keep cards effective for spaced repetition: clear fronts, complete but concise backs.
7. `front`/`back`/`notes` may contain markdown, including image links (`![alt](url)`). Preserve this formatting faithfully.
