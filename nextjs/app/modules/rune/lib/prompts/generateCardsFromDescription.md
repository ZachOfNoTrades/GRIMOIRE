Generate flash cards based on the provided topic description. Perform a web search as necessary.

## Topic Description

{{DESCRIPTION}}

## Target Deck

- Deck ID: `{{DECK_ID}}`
- Deck Name: {{DECK_NAME}}

## Custom Instructions

{{CUSTOM_PROMPT}}

## Schema

```typescript
interface GeneratedCard {
  front: string; // Question, prompt, or term — clear and concise
  back: string; // Answer — complete but not overly verbose
  notes: string | null; // Optional extra context, mnemonics, or hints
  order_index: number; // Sequential starting at {{START_INDEX}}
}

interface GenerateCardsPayload {
  cards: GeneratedCard[];
}
```

## Rules

1. The file must be a single JSON object matching `GenerateCardsPayload` — nothing else.
