# GRIMOIRE Modules

This page provides details on all the available modules in GRIMOIRE.

# Table of Contents

- [GOLEM - Workout Tracker and Generator]()
- [RUNE - Flashcard Study Tool]()

# Module Overview

## GOLEM

GOLEM is a LLM-backed workout program generator and tracking app. Spanning full month-long programs down to recommended set RPE, all facets of exercise are configurable via templates, prompts, and conversation with the desired AI of choice.

### Key Features

- **Session Tracking**: A fully-fledged tracker on its own, it has the ability to track sessions, exercises, notes, RPEs.
- **Prompts and Templates**: A unique markdown-style prompt is configurable from the UI to give instructions to the LLM, including all levels between full program and individual sessions. A user profile is also provided.
- **LLM Generation**: An LLM is used to generate all levels of a regiment, including the exercises and session notes. It uses prompt, user profile, and the surrounding workout notes as context to build.
- **SQL Skill**: The LLM has the ability to think and execute its own SQL queries on demand to build better.
- **CSV Import**: Import history from other apps with a robust mapping system to support different exercise names between different systems.

### How to Use

> Review the prompts in `/nextjs/app/modules/golem/lib/prompts` to better understand what the LLM sees.

1. Create a program template - enter desired prompt for the program, week, and session.
1. Enter a user profile. Anything that the LLM should take into context, like preferences and injury history.
1. Generate a program using a template. The first week of sessions are also automatically generated.
1. Open the first session, modify the generated session notes as desired (as the LLM takes that into context), and generate the exercises.
1. Open an exercise, log details, and mark sets as complete as you go.
1. Mark the session as complete once done.

## RUNE

RUNE is a flashcard study tool with LLM-powered card generation and voice controls for hands-free study sessions. Cards are organized into decks and use a spaced-repetition rating system (Again, Hard, Good, Easy) to track progress.

### Key Features

- **Deck Management**: Create and organize flashcard decks with descriptions and tags.
- **Card Generation**: Generate cards from Notion pages or freeform descriptions via LLM.
- **Spaced Repetition**: Rate cards after review to track study progress and schedule future reviews.
- **Voice Controls**: Speak questions aloud (TTS), record spoken answers (STT), and evaluate correctness via LLM.

### Voice Controls

> See the [Resource Guide](../resources/RESOURCES.md#rune) for Piper and Whisper setup instructions.

RUNE's voice system is built on three server-side components, each invoked via API routes:

#### Text-to-Speech (TTS)

Uses [Piper](https://github.com/rhasspy/piper), a fast local neural TTS engine. The server spawns the Piper CLI binary, generates a WAV file, and returns it as a base64 data URL.

#### Speech-to-Text (STT)

Uses [whisper.cpp](https://github.com/ggerganov/whisper.cpp), a local Whisper inference engine. The client captures audio via `ScriptProcessorNode` at 16kHz mono, encodes as WAV, and uploads to the server. The server writes the WAV to a temp file and runs the Whisper CLI binary. Silence detection auto-stops recording after speech is detected and a configurable silence period elapses.

#### Answer Evaluation

Uses LLM to evaluate the user's spoken answer against the expected answer. Returns a correctness boolean, suggested difficulty rating (1-4), and a brief explanation.

### How to Use

> Review the prompts in `/nextjs/app/modules/rune/lib/prompts` to better understand what the LLM sees.

1. Create a deck from the decks page.
1. Generate cards from a Notion page URL or a freeform description.
1. Start a study session from a deck's detail page.
1. Optionally enable hands-free mode before starting.
1. Use the speaker icon on the card to hear the question read aloud.
1. Use the record button (or let hands-free auto-record) to speak your answer.
1. Use the evaluate button (or let hands-free auto-evaluate) to check your answer.
1. Rate the card based on difficulty. In hands-free mode, the suggested rating is auto-selected after 5 seconds.
