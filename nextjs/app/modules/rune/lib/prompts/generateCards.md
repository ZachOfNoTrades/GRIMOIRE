Generate flash cards from the provided Notion page content. Create cards that are effective for spaced repetition study.

## Source Content

{{NOTION_CONTENT}}

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
