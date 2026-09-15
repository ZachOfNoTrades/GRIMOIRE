# RUNE

RUNE is a flashcard study tool with LLM-powered card generation and voice controls for hands-free study sessions. Cards are organized into decks and use a spaced-repetition rating system (Again, Hard, Good, Easy) to track progress.

## Key Features

- **Deck Management**: Create and organize flashcard decks with descriptions and tags.
- **Card Generation**: Generate cards from Notion pages or freeform descriptions via LLM.
- **Spaced Repetition**: Rate cards after review to track study progress and schedule future reviews.
- **Voice Controls**: Speak questions aloud (TTS), record spoken answers (STT), and evaluate correctness via LLM.

## Voice Controls

> See the [Resource Guide](../resources/RESOURCES.md#rune) for Piper and Whisper setup instructions.

RUNE's voice system is built on three server-side components, each invoked via API routes:

### Text-to-Speech (TTS)

Uses [Piper](https://github.com/rhasspy/piper), a fast local neural TTS engine. The server spawns the Piper CLI binary, generates a WAV file, and returns it as a base64 data URL.

### Speech-to-Text (STT)

Uses [whisper.cpp](https://github.com/ggerganov/whisper.cpp), a local Whisper inference engine. The client captures audio via `ScriptProcessorNode` at 16kHz mono, encodes as WAV, and uploads to the server. The server writes the WAV to a temp file and runs the Whisper CLI binary. Silence detection auto-stops recording after speech is detected and a configurable silence period elapses.

### Answer Evaluation

Uses LLM to evaluate the user's spoken answer against the expected answer. Returns a correctness boolean, suggested difficulty rating (1-4), and a brief explanation.

## How to Use

> Review the prompts in `/nextjs/app/modules/rune/lib/prompts` to better understand what the LLM sees.

1. Create a deck from the decks page.
1. Generate cards from a Notion page URL or a freeform description.
1. Start a study session from a deck's detail page.
1. Optionally enable hands-free mode before starting.
1. Use the speaker icon on the card to hear the question read aloud.
1. Use the record button (or let hands-free auto-record) to speak your answer.
1. Use the evaluate button (or let hands-free auto-evaluate) to check your answer.
1. Rate the card based on difficulty. In hands-free mode, the suggested rating is auto-selected after 5 seconds.
