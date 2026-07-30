Refine a single flash card based on user feedback. Return the modified card.

## User Feedback

{{FEEDBACK}}

## Current Card

- Front: {{CARD_FRONT}}
- Back: {{CARD_BACK}}
- Notes: {{CARD_NOTES}}

## Output

Respond ONLY with valid JSON in this exact format, no other text:

```json
{"front": "string", "back": "string", "notes": "string or null"}
```

## Rules

1. Apply the user's feedback faithfully to modify the card.
2. Keep the card effective for spaced repetition: clear front, complete but concise back.
3. Preserve the original meaning and topic unless the feedback explicitly asks to change it.
4. If the feedback only applies to the back (answer), keep the front unchanged, and vice versa.
5. Front/back/notes may contain markdown, including image links (`![alt](url)`). Preserve this formatting faithfully.
