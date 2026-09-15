# GRIMOIRE Modules

This page provides details on all the available modules in GRIMOIRE.

# Table of Contents

- [GOLEM - Workout Tracker and Generator]()
- [RUNE - Flashcard Study Tool]()
- [DAMNATION - Magic: The Gathering Life Tracker](#damnation)

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

## DAMNATION

DAMNATION is a Magic: The Gathering (MTG) life tracker for a table of 2 to 6 players. A shared board shows every player's life total, commander damage, and status, and players join from their phones with a short code or QR code, without a GRIMOIRE account.

<img src="./images/damnation/board_game.png" alt="DAMNATION board during a four-player game, with the activity card beside the table" width="900">

### Key Features

- **Shared Board**: The host's board arranges every player's card like the seats at the table, with a game card beside it that flips between the game setup and the activity feed.
- **Phone Controllers**: Players join from a phone with a code or QR code, no account needed, and see the same table layout as the board.
- **Open Editing**: Anyone in the game changes anyone's life, commander damage, and status, the way whoever is closest updates the count at a real table.
- **Live Updates**: Every change shows at once on the device that made it and reaches every other screen live; taps on the same counter are sent together after a 3-second pause.
- **Commander Damage**: Commander damage is tracked per opposing commander and also costs life; 21 from one commander puts a player out. It is switched per game, with a per-host default in settings.
- **Automatic Elimination**: A player is out at 0 life or 21 commander damage from one commander, shown as a skull across their card; **Out** and **Jump back in** cover conceding and corrections.
- **Table Layouts**: Layouts for each player count arrange the cards like the table, and the last layout picked for each count is remembered. Cards move by dragging their handle.
- **Lobby Control**: Starting the game closes the lobby and hides the join code; the lobby opens again for a late arrival without stopping the game.
- **Guest Player Management**: A per-game switch lets players add, rename, recolor, move, and remove players from their phones.
- **Activity Feed**: Every change is listed with its time; the entry's tooltip names who made it.
- **Wiki Search**: Card and rules lookup in a panel; wiki links stay in the panel, Scryfall card links show the card, and other sites open in a browser tab.
- **Resume and Reset**: An ended game resumes with its totals and a fresh join code, and **Reset game** starts the same table over at the starting life.

<img src="./images/damnation/live_updates.gif" alt="Taps on a phone reach the board, and taps on the board reach the phone" width="900">

### Configuration

The wiki search site applies to every game on the server and is set in the environment file (`nextjs/.env.local`, see `nextjs/.env.template.local`).

```
DAMNATION_WIKI_SEARCH_TEMPLATE=https://mtg.wiki/index.php?search={query}&title=Special%3ASearch&go=Go
DAMNATION_WIKI_EMBED=true
```

| Key                            | Type    | Default           | Description                                                                                  |
| ------------------------------ | ------- | ----------------- | -------------------------------------------------------------------------------------------- |
| DAMNATION_WIKI_SEARCH_TEMPLATE | string  | mtg.wiki search † | Search address for the Wiki panel, with `{query}` where the search text goes.                |
| DAMNATION_WIKI_EMBED           | boolean | true              | Shows results in a panel inside DAMNATION when `true`, or opens them in a browser tab when `false`. |

† _used when blank or invalid_

1. Set the keys in `nextjs/.env.local`.
1. Restart GRIMOIRE.

### How to Use

#### Hosting a Game

1. Open DAMNATION and select **Start game & open board**.
1. Choose the starting life, player count, table layout, commander damage, and guest player management on the setup card:

   <img src="./images/damnation/board_lobby.png" alt="Board before the game, with the setup card showing the QR code, join code, and game options" width="900">

1. Have each player scan the QR code, or go to the join address on a phone and enter the code.
1. Select **Add player** in an open spot for a player without a phone, then select the name or palette on their card to rename or recolor them.
1. Pick a table layout with the grid button beside the player counts:

   <img src="./images/damnation/layout_picker.png" alt="Table layout picker for four players" width="900">

1. Select **Start game** to close the lobby.

#### Playing

1. Select **−** or **+** beside a total to change it by 1, or **−5** and **+5** to change it by 5.
1. Open a card's **Status** section to record commander damage from each opponent, or mark the player **Out**:

   <img src="./images/damnation/board_status.png" alt="Status section open on a card, with commander damage from each opponent and the Out button" width="900">

1. Drag a card by its handle onto another card to swap the two players, or onto an open spot to move there:

   <img src="./images/damnation/drag_swap.gif" alt="Dragging a card onto another card swaps the two players" width="900">

1. Select **Game Setup** on the activity card to change the setup during the game, or **Open lobby** to let a late arrival join:

   <img src="./images/damnation/board_game_setup.png" alt="Game setup during a game, with the join code hidden behind Open lobby" width="900">

1. Use the ⋯ menu for the wiki, full screen, settings, help, **Reset game**, and **Delete game**.

#### Joining From a Phone

1. Scan the board's QR code, or go to the join address and enter the code.
1. Enter a name, pick a color, and select **Join game**:

   <img src="./images/damnation/phone_join.png" alt="Join screen on a phone with name and color" width="300">

1. Change any player's life, commander damage, and status from their card; the phone shows the board's table layout:

   <img src="./images/damnation/phone_controller.png" alt="Phone controller showing the table layout during a game" width="300">
